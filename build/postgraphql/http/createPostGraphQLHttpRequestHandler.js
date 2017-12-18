"use strict";
var tslib_1 = require("tslib");
var path_1 = require("path");
var fs_1 = require("fs");
var graphql_1 = require("graphql");
var extendedFormatError_1 = require("../extendedFormatError");
var setupServerSentEvents_1 = require("./setupServerSentEvents");
var withPostGraphQLContext_1 = require("../withPostGraphQLContext");
var chalk = require('chalk');
var Debugger = require('debug'); // tslint:disable-line variable-name
var httpError = require('http-errors');
var parseUrl = require('parseurl');
var finalHandler = require('finalhandler');
var bodyParser = require('body-parser');
var sendFile = require('send');
var POSTGRAPHQL_ENV = process.env.POSTGRAPHQL_ENV;
var debugGraphql = new Debugger('postgraphql:graphql');
var debugRequest = new Debugger('postgraphql:request');
exports.graphiqlDirectory = path_1.resolve(__dirname, '../graphiql/public');
/**
 * The favicon file in `Buffer` format. We can send a `Buffer` directly to the
 * client.
 *
 * @type {Promise<Buffer>}
 */
var favicon = new Promise(function (resolve, reject) {
    fs_1.readFile(path_1.resolve(__dirname, '../../../resources/favicon.ico'), function (error, data) {
        if (error)
            reject(error);
        else
            resolve(data);
    });
});
/**
 * The GraphiQL HTML file as a string. We need it to be a string, because we
 * will use a regular expression to replace some variables.
 *
 * @type {Promise<string>}
 */
var origGraphiqlHtml = new Promise(function (resolve, reject) {
    fs_1.readFile(path_1.resolve(__dirname, '../graphiql/public/index.html'), 'utf8', function (error, data) {
        if (error)
            reject(error);
        else
            resolve(data);
    });
});
/**
 * Creates a GraphQL request handler, this is untyped besides some JSDoc types
 * for intellisense.
 *
 * @param {GraphQLSchema} graphqlSchema
 */
function createPostGraphQLHttpRequestHandler(options) {
    var _this = this;
    var getGqlSchema = options.getGqlSchema, pgPool = options.pgPool, pgSettings = options.pgSettings, pgDefaultRole = options.pgDefaultRole, jwtSecret = options.jwtSecret, jwtAudiences = options.jwtAudiences, jwtRole = options.jwtRole, additionalGraphQLContextFromRequest = options.additionalGraphQLContextFromRequest, eventListenerFactory = options.eventListenerFactory;
    if (pgDefaultRole && typeof pgSettings === 'function') {
        throw new Error('pgDefaultRole cannot be combined with pgSettings(req) - please remove pgDefaultRole and instead always return a `role` key from pgSettings(req).');
    }
    if (pgDefaultRole && pgSettings && typeof pgSettings === 'object' && Object.keys(pgSettings).map(function (s) { return s.toLowerCase(); }).indexOf('role') >= 0) {
        throw new Error('pgDefaultRole cannot be combined with pgSettings.role - please use one or the other.');
    }
    // Gets the route names for our GraphQL endpoint, and our GraphiQL endpoint.
    var graphqlRoute = options.graphqlRoute || '/graphql';
    var graphiqlRoute = options.graphiql === true ? options.graphiqlRoute || '/graphiql' : null;
    // Throw an error of the GraphQL and GraphiQL routes are the same.
    if (graphqlRoute === graphiqlRoute)
        throw new Error("Cannot use the same route, '" + graphqlRoute + "', for both GraphQL and GraphiQL. Please use different routes.");
    // Formats an error using the default GraphQL `formatError` function, and
    // custom formatting using some other options.
    var formatError = function (error) {
        // Get the appropriate formatted error object, including any extended error
        // fields if the user wants them.
        var formattedError = options.extendedErrors && options.extendedErrors.length ?
            extendedFormatError_1.extendedFormatError(error, options.extendedErrors) : graphql_1.formatError(error);
        // If the user wants to see the error’s stack, let’s add it to the
        // formatted error.
        if (options.showErrorStack)
            formattedError.stack = options.showErrorStack === 'json' ? error.stack.split('\n') : error.stack;
        return formattedError;
    };
    // Define a list of middlewares that will get run before our request handler.
    // Note though that none of these middlewares will intercept a request (i.e.
    // not call `next`). Middlewares that handle a request like favicon
    // middleware will result in a promise that never resolves, and we don’t
    // want that.
    var bodyParserMiddlewares = [
        // Parse JSON bodies.
        bodyParser.json({ limit: options.bodySizeLimit }),
        // Parse URL encoded bodies (forms).
        bodyParser.urlencoded({ extended: false }),
        // Parse `application/graphql` content type bodies as text.
        bodyParser.text({ type: 'application/graphql' }),
    ];
    // Takes the original GraphiQL HTML file and replaces the default config object.
    var graphiqlHtml = origGraphiqlHtml.then(function (html) { return html.replace(/window\.POSTGRAPHQL_CONFIG\s*=\s*\{[^]*\}/, "window.POSTGRAPHQL_CONFIG={graphqlUrl:'" + graphqlRoute + "',streamUrl:" + (options.watchPg ? '\'/_postgraphql/stream\'' : 'null') + "}"); });
    /**
     * The actual request handler. It’s an async function so it will return a
     * promise when complete. If the function doesn’t handle anything, it calls
     * `next` to let the next middleware try and handle it.
     *
     * @param {IncomingMessage} req
     * @param {ServerResponse} res
     */
    var requestHandler = function (req, res, next) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
        var _a, _b, _c, assetPath_1, _d, _e, _f, params, result, queryDocumentAst, queryTimeStart, pgRole, gqlSchema_1, source, validationErrors, jwtToken, additionalContext_1, _g, _h, _j, _k, _l, error_1, prettyQuery, errorCount, timeDiff, ms;
        return tslib_1.__generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    // Add our CORS headers to be good web citizens (there are perf
                    // implications though so be careful!)
                    //
                    // Always enable CORS when developing PostGraphQL because GraphiQL will be
                    // on port 5783.
                    if (options.enableCors || POSTGRAPHQL_ENV === 'development')
                        addCORSHeaders(res);
                    if (!options.graphiql) return [3 /*break*/, 6];
                    if (!(parseUrl(req).pathname === '/favicon.ico')) return [3 /*break*/, 2];
                    // If this is the wrong method, we should let the client know.
                    if (!(req.method === 'GET' || req.method === 'HEAD')) {
                        res.statusCode = req.method === 'OPTIONS' ? 200 : 405;
                        res.setHeader('Allow', 'GET, HEAD, OPTIONS');
                        res.end();
                        return [2 /*return*/];
                    }
                    // Otherwise we are good and should pipe the favicon to the browser.
                    res.statusCode = 200;
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                    res.setHeader('Content-Type', 'image/x-icon');
                    // End early if the method is `HEAD`.
                    if (req.method === 'HEAD') {
                        res.end();
                        return [2 /*return*/];
                    }
                    _b = (_a = res).end;
                    return [4 /*yield*/, favicon];
                case 1:
                    _b.apply(_a, [_m.sent()]);
                    return [2 /*return*/];
                case 2:
                    if (!parseUrl(req).pathname.startsWith('/_postgraphql/graphiql/')) return [3 /*break*/, 4];
                    // If using the incorrect method, let the user know.
                    if (!(req.method === 'GET' || req.method === 'HEAD')) {
                        res.statusCode = req.method === 'OPTIONS' ? 200 : 405;
                        res.setHeader('Allow', 'GET, HEAD, OPTIONS');
                        res.end();
                        return [2 /*return*/];
                    }
                    assetPath_1 = parseUrl(req).pathname.slice('/_postgraphql/graphiql/'.length);
                    // Don’t allow certain files generated by `create-react-app` to be
                    // inspected.
                    if (assetPath_1 === 'index.html' || assetPath_1 === 'asset-manifest.json') {
                        res.statusCode = 404;
                        res.end();
                        return [2 /*return*/];
                    }
                    // Sends the asset at this path. Defaults to a `statusCode` of 200.
                    res.statusCode = 200;
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var stream = sendFile(req, path_1.join(exports.graphiqlDirectory, assetPath_1), { index: false })
                                .on('end', resolve)
                                .on('error', reject)
                                .pipe(res);
                        })];
                case 3:
                    _m.sent();
                    return [2 /*return*/];
                case 4:
                    // ======================================================================
                    // GraphiQL Watch Stream
                    // ======================================================================
                    // Setup an event stream so we can broadcast events to graphiql, etc.
                    if (parseUrl(req).pathname === '/_postgraphql/stream') {
                        if (req.headers.accept !== 'text/event-stream') {
                            res.statusCode = 405;
                            res.end();
                            return [2 /*return*/];
                        }
                        setupServerSentEvents_1.default(req, res, options);
                        return [2 /*return*/];
                    }
                    if (!(parseUrl(req).pathname === graphiqlRoute)) return [3 /*break*/, 6];
                    // If we are developing PostGraphQL, instead just redirect.
                    if (POSTGRAPHQL_ENV === 'development') {
                        res.writeHead(302, { Location: 'http://localhost:5783' });
                        res.end();
                        return [2 /*return*/];
                    }
                    // If using the incorrect method, let the user know.
                    if (!(req.method === 'GET' || req.method === 'HEAD')) {
                        res.statusCode = req.method === 'OPTIONS' ? 200 : 405;
                        res.setHeader('Allow', 'GET, HEAD, OPTIONS');
                        res.end();
                        return [2 /*return*/];
                    }
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    // End early if the method is `HEAD`.
                    if (req.method === 'HEAD') {
                        res.end();
                        return [2 /*return*/];
                    }
                    // Actually renders GraphiQL.
                    _e = (_d = res).end;
                    return [4 /*yield*/, graphiqlHtml];
                case 5:
                    // Actually renders GraphiQL.
                    _e.apply(_d, [_m.sent()]);
                    return [2 /*return*/];
                case 6:
                    // Don’t handle any requests if this is not the correct route.
                    if (parseUrl(req).pathname !== graphqlRoute)
                        return [2 /*return*/, next()];
                    // ========================================================================
                    // Execute GraphQL Queries
                    // ========================================================================
                    // If we didn’t call `next` above, all requests will return 200 by default!
                    res.statusCode = 200;
                    // Don’t execute our GraphQL stuffs for `OPTIONS` requests.
                    if (req.method === 'OPTIONS') {
                        res.statusCode = 200;
                        res.end();
                        return [2 /*return*/];
                    }
                    queryTimeStart = process.hrtime();
                    debugRequest('GraphQL query request has begun.');
                    _m.label = 7;
                case 7:
                    _m.trys.push([7, 18, 19, 20]);
                    return [4 /*yield*/, getGqlSchema()];
                case 8:
                    gqlSchema_1 = _m.sent();
                    // Run all of our middleware by converting them into promises and
                    // chaining them together. Remember that if we have a middleware that
                    // never calls `next`, we will have a promise that never resolves! Avoid
                    // those middlewares.
                    //
                    // Note that we also run our middleware after we make sure we are on the
                    // correct route. This is so that if our middleware modifies the `req` or
                    // `res` objects, only we downstream will see the modifications.
                    //
                    // We also run our middleware inside the `try` so that we get the GraphQL
                    // error reporting style for syntax errors.
                    return [4 /*yield*/, bodyParserMiddlewares.reduce(function (promise, middleware) { return (promise.then(function () { return new Promise(function (resolve, reject) {
                            middleware(req, res, function (error) {
                                if (error)
                                    reject(error);
                                else
                                    resolve();
                            });
                        }); })); }, Promise.resolve())];
                case 9:
                    // Run all of our middleware by converting them into promises and
                    // chaining them together. Remember that if we have a middleware that
                    // never calls `next`, we will have a promise that never resolves! Avoid
                    // those middlewares.
                    //
                    // Note that we also run our middleware after we make sure we are on the
                    // correct route. This is so that if our middleware modifies the `req` or
                    // `res` objects, only we downstream will see the modifications.
                    //
                    // We also run our middleware inside the `try` so that we get the GraphQL
                    // error reporting style for syntax errors.
                    _m.sent();
                    // If this is not one of the correct methods, throw an error.
                    if (req.method !== 'POST') {
                        res.setHeader('Allow', 'POST, OPTIONS');
                        throw httpError(405, 'Only `POST` requests are allowed.');
                    }
                    // Get the parameters we will use to run a GraphQL request. `params` may
                    // include:
                    //
                    // - `query`: The required GraphQL query string.
                    // - `variables`: An optional JSON object containing GraphQL variables.
                    // - `operationName`: The optional name of the GraphQL operation we will
                    //   be executing.
                    params = typeof req.body === 'string' ? { query: req.body } : req.body;
                    // Validate our params object a bit.
                    if (params == null)
                        throw httpError(400, 'Must provide an object parameters, not nullish value.');
                    if (typeof params !== 'object')
                        throw httpError(400, "Expected parameter object, not value of type '" + typeof params + "'.");
                    if (Array.isArray(params))
                        throw httpError(501, 'Batching queries as an array is currently unsupported. Please provide a single query object.');
                    if (!params.query)
                        throw httpError(400, 'Must provide a query string.');
                    // If variables is a string, we assume it is a JSON string and that it
                    // needs to be parsed.
                    if (typeof params.variables === 'string') {
                        // If variables is just an empty string, we should set it to null and
                        // ignore it.
                        if (params.variables === '') {
                            params.variables = null;
                        }
                        else {
                            try {
                                params.variables = JSON.parse(params.variables);
                            }
                            catch (error) {
                                error.statusCode = 400;
                                throw error;
                            }
                        }
                    }
                    // Throw an error if `variables` is not an object.
                    if (params.variables != null && typeof params.variables !== 'object')
                        throw httpError(400, "Variables must be an object, not '" + typeof params.variables + "'.");
                    // Throw an error if `operationName` is not a string.
                    if (params.operationName != null && typeof params.operationName !== 'string')
                        throw httpError(400, "Operation name must be a string, not '" + typeof params.operationName + "'.");
                    source = new graphql_1.Source(params.query, 'GraphQL Http Request');
                    // Catch an errors while parsing so that we can set the `statusCode` to
                    // 400. Otherwise we don’t need to parse this way.
                    try {
                        queryDocumentAst = graphql_1.parse(source);
                    }
                    catch (error) {
                        res.statusCode = 400;
                        throw error;
                    }
                    debugRequest('GraphQL query is parsed.');
                    validationErrors = graphql_1.validate(gqlSchema_1, queryDocumentAst);
                    // If we have some validation errors, don’t execute the query. Instead
                    // send the errors to the client with a `400` code.
                    if (validationErrors.length > 0) {
                        res.statusCode = 400;
                        result = { errors: validationErrors };
                        return [2 /*return*/];
                    }
                    debugRequest('GraphQL query is validated.');
                    // Lazily log the query. If this debugger isn’t enabled, don’t run it.
                    if (debugGraphql.enabled)
                        debugGraphql(graphql_1.print(queryDocumentAst).replace(/\s+/g, ' ').trim());
                    jwtToken = options.jwtSecret ? getJwtToken(req) : null;
                    if (!(typeof additionalGraphQLContextFromRequest === 'function')) return [3 /*break*/, 11];
                    return [4 /*yield*/, additionalGraphQLContextFromRequest(req)];
                case 10:
                    _g = _m.sent();
                    return [3 /*break*/, 12];
                case 11:
                    _g = {};
                    _m.label = 12;
                case 12:
                    additionalContext_1 = _g;
                    _h = withPostGraphQLContext_1.default;
                    _k = {
                        pgPool: pgPool,
                        jwtToken: jwtToken,
                        jwtSecret: jwtSecret,
                        jwtAudiences: jwtAudiences,
                        jwtRole: jwtRole,
                        pgDefaultRole: pgDefaultRole
                    };
                    return [4 /*yield*/, eventListenerFactory(req, res)];
                case 13:
                    _k.eventListener = _m.sent();
                    if (!(typeof pgSettings === 'function')) return [3 /*break*/, 15];
                    return [4 /*yield*/, pgSettings(req)];
                case 14:
                    _l = _m.sent();
                    return [3 /*break*/, 16];
                case 15:
                    _l = pgSettings;
                    _m.label = 16;
                case 16: return [4 /*yield*/, _h.apply(void 0, [(_k.pgSettings = _l,
                            _k), function (context) {
                            pgRole = context.pgRole;
                            var graphqlContext = Object.assign({}, additionalContext_1, context);
                            return graphql_1.execute(gqlSchema_1, queryDocumentAst, null, graphqlContext, params.variables, params.operationName);
                        }])];
                case 17:
                    result = _m.sent();
                    return [3 /*break*/, 20];
                case 18:
                    error_1 = _m.sent();
                    // Set our status code and send the client our results!
                    if (res.statusCode === 200)
                        res.statusCode = error_1.status || error_1.statusCode || 500;
                    result = { errors: [error_1] };
                    // If the status code is 500, let’s log our error.
                    if (res.statusCode === 500)
                        // tslint:disable-next-line no-console
                        console.error(error_1.stack);
                    return [3 /*break*/, 20];
                case 19:
                    debugRequest('GraphQL query has been executed.');
                    // Format our errors so the client doesn’t get the full thing.
                    if (result && result.errors)
                        result.errors = result.errors.map(formatError);
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify(result));
                    debugRequest('GraphQL query request finished.');
                    // Log the query. If this debugger isn’t enabled, don’t run it.
                    if (queryDocumentAst && !options.disableQueryLog) {
                        prettyQuery = graphql_1.print(queryDocumentAst).replace(/\s+/g, ' ').trim();
                        errorCount = (result.errors || []).length;
                        timeDiff = process.hrtime(queryTimeStart);
                        ms = Math.round((timeDiff[0] * 1e9 + timeDiff[1]) * 10e-7 * 100) / 100;
                        // If we have enabled the query log for the Http handler, use that.
                        // tslint:disable-next-line no-console
                        console.log(chalk[errorCount === 0 ? 'green' : 'red'](errorCount + " error(s)") + " " + (pgRole != null ? "as " + chalk.magenta(pgRole) + " " : '') + "in " + chalk.grey(ms + "ms") + " :: " + prettyQuery);
                    }
                    return [7 /*endfinally*/];
                case 20: return [2 /*return*/];
            }
        });
    }); };
    /**
     * A polymorphic request handler that should detect what `http` framework is
     * being used and specifically handle that framework.
     *
     * Supported frameworks include:
     *
     * - Native Node.js `http`.
     * - `connect`.
     * - `express`.
     * - `koa` (2.0).
     */
    return function (a, b, c) {
        // If are arguments look like the arguments to koa middleware, this is
        // `koa` middleware.
        if (a.req && a.res && typeof b === 'function') {
            // Set the correct `koa` variable names…
            var ctx = a;
            var next = b;
            // Execute our request handler. If an error is thrown, we don’t call
            // `next` with an error. Instead we return the promise and let `koa`
            // handle the error.
            return requestHandler(ctx.req, ctx.res, next);
        }
        else {
            // Set the correct `connect` style variable names. If there was no `next`
            // defined (likely the case if the client is using `http`) we use the
            // final handler.
            var req = a;
            var res = b;
            var next_1 = c || finalHandler(req, res);
            // Execute our request handler.
            requestHandler(req, res, next_1).then(
            // If the request was fulfilled, noop.
            function () { }, 
            // If the request errored out, call `next` with the error.
            function (error) { return next_1(error); });
        }
    };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createPostGraphQLHttpRequestHandler;
/**
 * Adds CORS to a request. See [this][1] flowchart for an explanation of how
 * CORS works. Note that these headers are set for all requests, CORS
 * algorithms normally run a preflight request using the `OPTIONS` method to
 * get these headers.
 *
 * Note though, that enabling CORS will incur extra costs when it comes to the
 * preflight requests. It is much better if you choose to use a proxy and
 * bypass CORS altogether.
 *
 * [1]: http://www.html5rocks.com/static/images/cors_server_flowchart.png
 */
function addCORSHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Request-Method', 'HEAD, GET, POST');
    res.setHeader('Access-Control-Allow-Headers', [
        'Origin',
        'X-Requested-With',
        // Used by `express-graphql` to determine whether to expose the GraphiQL
        // interface (`text/html`) or not.
        'Accept',
        // Used by PostGraphQL for auth purposes.
        'Authorization',
        // The `Content-*` headers are used when making requests with a body,
        // like in a POST request.
        'Content-Type',
        'Content-Length',
    ].join(', '));
}
/**
 * Parses the `Bearer` auth scheme token out of the `Authorization` header as
 * defined by [RFC7235][1].
 *
 * ```
 * Authorization = credentials
 * credentials   = auth-scheme [ 1*SP ( token68 / #auth-param ) ]
 * token68       = 1*( ALPHA / DIGIT / "-" / "." / "_" / "~" / "+" / "/" )*"="
 * ```
 *
 * [1]: https://tools.ietf.org/html/rfc7235
 *
 * @private
 */
var authorizationBearerRex = /^\s*bearer\s+([a-z0-9\-._~+/]+=*)\s*$/i;
/**
 * Gets the JWT token from the Http request’s headers. Specifically the
 * `Authorization` header in the `Bearer` format. Will throw an error if the
 * header is in the incorrect format, but will not throw an error if the header
 * does not exist.
 *
 * @private
 * @param {IncomingMessage} request
 * @returns {string | null}
 */
function getJwtToken(request) {
    var authorization = request.headers.authorization;
    // If there was no authorization header, just return null.
    if (authorization == null)
        return null;
    var match = authorizationBearerRex.exec(authorization);
    // If we did not match the authorization header with our expected format,
    // throw a 400 error.
    if (!match)
        throw httpError(400, 'Authorization header is not of the correct bearer scheme format.');
    // Return the token from our match.
    return match[1];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlUG9zdEdyYXBoUUxIdHRwUmVxdWVzdEhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvcG9zdGdyYXBocWwvaHR0cC9jcmVhdGVQb3N0R3JhcGhRTEh0dHBSZXF1ZXN0SGFuZGxlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDZCQUErRDtBQUMvRCx5QkFBNkI7QUFFN0IsbUNBUWdCO0FBQ2hCLDhEQUE0RDtBQUk1RCxpRUFBMkQ7QUFFM0Qsb0VBQThEO0FBRTlELElBQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQTtBQUM5QixJQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUEsQ0FBQyxvQ0FBb0M7QUFDdEUsSUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFBO0FBQ3hDLElBQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQTtBQUNwQyxJQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUE7QUFDNUMsSUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFBO0FBQ3pDLElBQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQTtBQUV4QixJQUFBLDZDQUFlLENBQWdCO0FBRXZDLElBQU0sWUFBWSxHQUFHLElBQUksUUFBUSxDQUFDLHFCQUFxQixDQUFDLENBQUE7QUFDeEQsSUFBTSxZQUFZLEdBQUcsSUFBSSxRQUFRLENBQUMscUJBQXFCLENBQUMsQ0FBQTtBQUUzQyxRQUFBLGlCQUFpQixHQUFHLGNBQVcsQ0FBQyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsQ0FBQTtBQUU3RTs7Ozs7R0FLRztBQUNILElBQU0sT0FBTyxHQUFHLElBQUksT0FBTyxDQUFDLFVBQUMsT0FBTyxFQUFFLE1BQU07SUFDMUMsYUFBUSxDQUFDLGNBQVcsQ0FBQyxTQUFTLEVBQUUsZ0NBQWdDLENB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