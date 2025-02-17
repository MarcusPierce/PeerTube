# Tests

## Preparation

Prepare PostgreSQL user so PeerTube can delete/create the test databases:

```bash
$ sudo -u postgres createuser you_username --createdb --superuser
```

Prepare databases:

```bash
$ npm run clean:server:test
```

Build PeerTube:

```bash
$ npm run build
```

## Server tests

### Dependencies

Run docker containers needed by some test files:

```bash
$ sudo docker run -p 9444:9000 chocobozzz/s3-ninja
$ sudo docker run -p 10389:10389 chocobozzz/docker-test-openldap
```

### Test

To run all test suites:

```bash
$ npm run test # See scripts/test.sh to run a particular suite
```

Most of tests can be runned using:

```bash
TS_NODE_TRANSPILE_ONLY=true mocha -- --timeout 30000 --exit -r ts-node/register -r tsconfig-paths/register --bail server/tests/api/videos/video-transcoder.ts
```

`server/tests/api/activitypub` tests will need different options:

```
TS_NODE_FILES=true mocha -- --timeout 30000 --exit -r ts-node/register -r tsconfig-paths/register --bail server/tests/api/activitypub/security.ts
```

### Configuration

Some env variables can be defined to disable/enable some tests:

 * `DISABLE_HTTP_IMPORT_TESTS=true`: disable import tests (because of youtube that could rate limit your IP)
 * `ENABLE_OBJECT_STORAGE_TESTS=true`: enable object storage tests (needs `chocobozzz/s3-ninja` container first)


### Debug server logs

While testing, you might want to display a server's logs to understand why they failed:

```bash
NODE_APP_INSTANCE=1 NODE_ENV=test npm run parse-log -- --level debug | less +GF
```


## Client E2E tests

### Local tests

To run tests on local web browsers (comment web browsers you don't have in `client/e2e/wdio.local.conf.ts`):

```bash
$ npm run e2e:local
```

### Browserstack tests

To run tests on browser stack:

```bash
$ BROWSERSTACK_USER=your_user BROWSERSTACK_KEY=your_key npm run e2e:browserstack
```

### Add E2E tests

To add E2E tests and quickly run tests using a local Chrome, first create a test instance:

```bash
$ npm run clean:server:test && NODE_APP_INSTANCE=1 NODE_ENV=test npm start
```

Then, just run your suite using:

```bash
$ cd client/e2e
$ ../node_modules/.bin/wdio wdio.local-test.conf.ts # you can also add --mochaOpts.grep to only run tests you want
```
