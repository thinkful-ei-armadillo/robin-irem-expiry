/* eslint-disable no-undef */
'use strict';

const knex = require('knex');
const app = require('../src/app');
const helpers = require('./test-helpers');

describe('Things Endpoints', function() {
  let db;

  const { testUsers, testThings, testReviews } = helpers.makeThingsFixtures();

  // function makeAuthHeader(user) {
  //   const token = Buffer.from(`${user.user_name}:${user.password}`).toString('base64');
  //   return `Bearer ${token}`;
  // }

  before('make knex instance', () => {
    db = knex({
      client: 'pg',
      connection: process.env.TEST_DB_URL
    });
    app.set('db', db);
  });

  after('disconnect from db', () => db.destroy());

  before('cleanup', () => helpers.cleanTables(db));

  afterEach('cleanup', () => helpers.cleanTables(db));

  describe('Protected endpoints', () => {
    beforeEach('insert things', () =>
      helpers.seedThingsTables(db, testUsers, testThings, testReviews)
    );

    describe('GET /api/things/:thing_id', () => {
      it('responds with 401 \'Missing bearer token\' when no bearer token', () => {
        return supertest(app)
          .get('/api/things/123')
          .expect(401, { error: 'Missing bearer token' });
      });
      it('responds 401 \'Unauthorized request\' when invalid JWT secret', () => {
        const validUser = testUsers[0];
        const invalidSecret = 'bad-secret';
        return supertest(app)
          .post('/api/things/123')
          .set('Authorization', helpers.makeAuthHeader(validUser, invalidSecret))
          .expect(401, { error: 'Unauthorized request' });
      });
      it('responds 401 \'Unauthorized request\' when invalid sub in payload', () => {
        const invalidUser = { user_name: 'user-not-existy', id: 1 };
        return supertest(app)
          .post('/api/things/123')
          .set('Authorization', helpers.makeAuthHeader(invalidUser))
          .expect(401, { error: 'Unauthorized request' });
      });
    });
  });

  describe('GET /api/things', () => {
    context('Given no things', () => {
      it('responds with 200 and an empty list', () => {
        return supertest(app)
          .get('/api/things')
          .expect(200, []);
      });
    });

    context('Given there are things in the database', () => {
      beforeEach('insert things', () =>
        helpers.seedThingsTables(db, testUsers, testThings, testReviews)
      );

      it('responds with 200 and all of the things', () => {
        const expectedThings = testThings.map(thing =>
          helpers.makeExpectedThing(testUsers, thing, testReviews)
        );
        return supertest(app)
          .get('/api/things')
          .expect(200)
          .expect(res => {
            expect(res.body[0].id).to.eql(expectedThings[0].id);
            expect(res.body[0].title).to.eql(expectedThings[0].title);
            expect(res.body[0].content).to.eql(expectedThings[0].content);
            expect(res.body[0].image).to.eql(expectedThings[0].image);
            const expectedDate = new Date(expectedThings[0].date_created).toLocaleString('en', {timeZone:'UTC'});
            const actualDate = new Date(res.body[0].date_created).toLocaleString();
            expect(actualDate).to.eql(expectedDate);
          });
      });
    });

    context('Given an XSS attack thing', () => {
      const testUser = helpers.makeUsersArray()[1];
      const { maliciousThing, expectedThing } = helpers.makeMaliciousThing(
        testUser
      );

      beforeEach('insert malicious thing', () => {
        return helpers.seedMaliciousThing(db, testUser, maliciousThing);
      });

      it('removes XSS attack content', () => {
        return supertest(app)
          .get('/api/things')
          .expect(200)
          .expect(res => {
            expect(res.body[0].title).to.eql(expectedThing.title);
            expect(res.body[0].content).to.eql(expectedThing.content);
          });
      });
    });
  });

  describe('GET /api/things/:thing_id', () => {
    context('Given no things', () => {
      beforeEach('insert things', () => 
        helpers.seedThingsTables(db, testUsers));
      it('responds with 404', () => {
        const thingId = 123456;
        return supertest(app)
          .get(`/api/things/${thingId}`)
          .set('Authorization', helpers.makeAuthHeader(testUsers[0], process.env.JWT_SECRET))
          .expect(404, { error: 'Thing doesn\'t exist' });
      });
    });

    context('Given there are things in the database', () => {
      beforeEach('insert things', () =>
        helpers.seedThingsTables(db, testUsers, testThings, testReviews)
      );

      it('responds with 200 and the specified thing', () => {
        const thingId = 2;
        const expectedThing = helpers.makeExpectedThing(
          testUsers,
          testThings[thingId - 1],
          testReviews
        );

        return supertest(app)
          .get(`/api/things/${thingId}`)
          .set('Authorization', helpers.makeAuthHeader(testUsers[0], process.env.JWT_SECRET))
          .expect(200)
          .expect(res => {
            expect(res.body.title).to.eql(expectedThing.title);
            expect(res.body.content).to.eql(expectedThing.content);
          });
      });

      context('Given an XSS attack thing', () => {
        const testUser = helpers.makeUsersArray()[1];
        const { maliciousThing, expectedThing } = helpers.makeMaliciousThing(
          testUser
        );

        beforeEach('insert malicious thing', () => {
          return helpers.seedMaliciousThing(db, testUser, maliciousThing);
        });

        it.skip('removes XSS attack content', () => {
          return supertest(app)
            .get(`/api/things/${maliciousThing.id}`)
            .set('Authorization', helpers.makeAuthHeader(testUser, process.env.JWT_SECRET))
            .expect(200)
            .expect(res => {
              expect(res.body.title).to.eql(expectedThing.title);
              expect(res.body.content).to.eql(expectedThing.content);
            });
        });
      });
    });

    describe('GET /api/things/:thing_id/reviews', () => {
      context('Given no things', () => {
        it('responds with 404', () => {
          const thingId = 123456;
          return supertest(app)
            .get(`/api/things/${thingId}/reviews`)
            .expect(404, { error: 'Thing doesn\'t exist' });
        });
      });

      context('Given there are reviews for thing in the database', () => {
        beforeEach('insert things', () =>
          helpers.seedThingsTables(db, testUsers, testThings, testReviews)
        );

        it('responds with 200 and the specified reviews', () => {
          const thingId = 1;
          const expectedReviews = helpers.makeExpectedThingReviews(
            testUsers,
            thingId,
            testReviews
          );
        

          return supertest(app)
            .get(`/api/things/${thingId}/reviews`)
            .set('Authorization', helpers.makeAuthHeader(testUsers[0], process.env.JWT_SECRET))
            .expect(200)
            .expect(res => {
              expect(res.body[0].id).to.eql(expectedReviews[0].id);
              expect(res.body[0].text).to.eql(expectedReviews[0].text);
              expect(res.body[0].rating).to.eql(expectedReviews[0].rating);
              // expect(res.body[0].user).to.eql(expectedReviews[0].user);
              const expectedDate = new Date(expectedReviews[0].date_created).toLocaleString('en', {timeZone:'UTC'});
              const actualDate = new Date(res.body[0].date_created).toLocaleString();
              expect(actualDate).to.eql(expectedDate);
            });
        });
      });
    });
  });});
