"use strict";
var tslib_1 = require("tslib");
var createDebugger = require("debug");
var jwt = require("jsonwebtoken");
var sql = require("pg-sql2");
var pgClientFromContext_1 = require("../postgres/inventory/pgClientFromContext");
/**
 * Creates a PostGraphQL context object which should be passed into a GraphQL
 * execution. This function will also connect a client from a Postgres pool and
 * setup a transaction in that client.
 *
 * This function is intended to wrap a call to GraphQL-js execution like so:
 *
 * ```js
 * const result = await withPostGraphQLContext({
 *   pgPool,
 *   jwtToken,
 *   jwtSecret,
 *   pgDefaultRole,
 * }, async context => {
 *   return await graphql(
 *     schema,
 *     query,
 *     null,
 *     { ...context },
 *     variables,
 *     operationName,
 *   );
 * });
 * ```
 */
function withPostGraphQLContext(_a, callback) {
    var pgPool = _a.pgPool, jwtToken = _a.jwtToken, jwtSecret = _a.jwtSecret, _b = _a.jwtAudiences, jwtAudiences = _b === void 0 ? ['postgraphql'] : _b, _c = _a.jwtRole, jwtRole = _c === void 0 ? ['role'] : _c, pgDefaultRole = _a.pgDefaultRole, pgSettings = _a.pgSettings, eventListener = _a.eventListener;
    return tslib_1.__awaiter(this, void 0, void 0, function () {
        var pgClient, pgRole, _a;
        return tslib_1.__generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, pgPool.connect()];
                case 1:
                    pgClient = _b.sent();
                    // Enhance our Postgres client with debugging stuffs.
                    debugPgClient(pgClient);
                    // Begin our transaction and set it up.
                    return [4 /*yield*/, pgClient.query('begin')];
                case 2:
                    // Begin our transaction and set it up.
                    _b.sent();
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, , 6, 8]);
                    return [4 /*yield*/, setupPgClientTransaction({
                            pgClient: pgClient,
                            jwtToken: jwtToken,
                            jwtSecret: jwtSecret,
                            jwtAudiences: jwtAudiences,
                            jwtRole: jwtRole,
                            pgDefaultRole: pgDefaultRole,
                            pgSettings: pgSettings,
                        })];
                case 4:
                    pgRole = _b.sent();
                    return [4 /*yield*/, callback((_a = {},
                            _a[pgClientFromContext_1.$$pgClient] = pgClient,
                            _a.eventListener = eventListener,
                            _a.pgRole = pgRole,
                            _a))];
                case 5: return [2 /*return*/, _b.sent()];
                case 6: return [4 /*yield*/, pgClient.query('commit')];
                case 7:
                    _b.sent();
                    pgClient.release();
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    });
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = withPostGraphQLContext;
/**
 * Sets up the Postgres client transaction by decoding the JSON web token and
 * doing some other cool things.
 */
// THIS METHOD SHOULD NEVER RETURN EARLY. If this method returns early then it
// may skip the super important step of setting the role on the Postgres
// client. If this happens it’s a huge security vulnerability. Never using the
// keyword `return` in this function is a good first step. You can still throw
// errors, however, as this will stop the request execution.
function setupPgClientTransaction(_a) {
    var pgClient = _a.pgClient, jwtToken = _a.jwtToken, jwtSecret = _a.jwtSecret, jwtAudiences = _a.jwtAudiences, jwtRole = _a.jwtRole, pgDefaultRole = _a.pgDefaultRole, pgSettings = _a.pgSettings;
    return tslib_1.__awaiter(this, void 0, void 0, function () {
        var role, jwtClaims, roleClaim, localSettings, _i, _a, key, _b, _c, key, query, _d;
        return tslib_1.__generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    role = pgDefaultRole;
                    jwtClaims = {};
                    // If we were provided a JWT token, let us try to verify it. If verification
                    // fails we want to throw an error.
                    if (jwtToken) {
                        // Try to run `jwt.verify`. If it fails, capture the error and re-throw it
                        // as a 403 error because the token is not trustworthy.
                        try {
                            // If a JWT token was defined, but a secret was not provided to the server
                            // throw a 403 error.
                            if (typeof jwtSecret !== 'string')
                                throw new Error('Not allowed to provide a JWT token.');
                            jwtClaims = jwt.verify(jwtToken, jwtSecret, {
                                audience: jwtAudiences,
                            });
                            roleClaim = getPath(jwtClaims, jwtRole);
                            // If there is a `role` property in the claims, use that instead of our
                            // default role.
                            if (typeof roleClaim !== 'undefined') {
                                if (typeof roleClaim !== 'string')
                                    throw new Error("JWT `role` claim must be a string. Instead found '" + typeof jwtClaims['role'] + "'.");
                                role = roleClaim;
                            }
                        }
                        catch (error) {
                            // In case this error is thrown in an HTTP context, we want to add status code
                            // Note. jwt.verify will add a name key to its errors. (https://github.com/auth0/node-jsonwebtoken#errors--codes)
                            if (('name' in error) && error.name === 'TokenExpiredError') {
                                // The correct status code for an expired ( but otherwise acceptable token is 401 )
                                error.statusCode = 401;
                            }
                            else {
                                // All other authentication errors should get a 403 status code.
                                error.statusCode = 403;
                            }
                            throw error;
                        }
                    }
                    localSettings = new Map();
                    // Set the custom provided settings before jwt claims and role are set
                    // this prevents an accidentional overwriting
                    if (typeof pgSettings === 'object') {
                        for (_i = 0, _a = Object.keys(pgSettings); _i < _a.length; _i++) {
                            key = _a[_i];
                            if (isPgSettingValid(pgSettings[key])) {
                                localSettings.set(key, String(pgSettings[key]));
                            }
                        }
                    }
                    // If there is a rule, we want to set the root `role` setting locally
                    // to be our role. The role may only be null if we have no default role.
                    if (typeof role === 'string') {
                        localSettings.set('role', role);
                    }
                    // If we have some JWT claims, we want to set those claims as local
                    // settings with the namespace `jwt.claims`.
                    for (_b = 0, _c = Object.keys(jwtClaims); _b < _c.length; _b++) {
                        key = _c[_b];
                        localSettings.set("jwt.claims." + key, jwtClaims[key]);
                    }
                    if (!(localSettings.size !== 0)) return [3 /*break*/, 2];
                    query = sql.compile((_d = ["select ", ""], _d.raw = ["select ",
                        ""], sql.query(_d, sql.join(Array.from(localSettings).map(function (_a) {
                        var key = _a[0], value = _a[1];
                        // Make sure that the third config is always `true` so that we are only
                        // ever setting variables on the transaction.
                        return (_b = ["set_config(", ", ", ", true)"], _b.raw = ["set_config(", ", ", ", true)"], sql.query(_b, sql.value(key), sql.value(value)));
                        var _b;
                    }), ', '))));
                    // Execute the query.
                    return [4 /*yield*/, pgClient.query(query)];
                case 1:
                    // Execute the query.
                    _e.sent();
                    _e.label = 2;
                case 2: return [2 /*return*/, role];
            }
        });
    });
}
var $$pgClientOrigQuery = Symbol();
var debugPg = createDebugger('postgraphql:postgres');
var debugPgError = createDebugger('postgraphql:postgres:error');
/**
 * Adds debug logging funcionality to a Postgres client.
 *
 * @private
 */
// tslint:disable no-any
function debugPgClient(pgClient) {
    // If Postgres debugging is enabled, enhance our query function by adding
    // a debug statement.
    if (debugPg.enabled || debugPgError.enabled) {
        // Set the original query method to a key on our client. If that key is
        // already set, use that.
        pgClient[$$pgClientOrigQuery] = pgClient[$$pgClientOrigQuery] || pgClient.query;
        // tslint:disable-next-line only-arrow-functions
        pgClient.query = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            // Debug just the query text. We don’t want to debug variables because
            // there may be passwords in there.
            debugPg(args[0] && args[0].text ? args[0].text : args[0]);
            // tslint:disable-next-line no-invalid-this
            var promiseResult = pgClient[$$pgClientOrigQuery].apply(this, args);
            // Report the error with our Postgres debugger.
            promiseResult.catch(function (error) { return debugPgError(error); });
            return promiseResult;
        };
    }
    return pgClient;
}
/**
 * Safely gets the value at `path` (array of keys) of `inObject`.
 *
 * @private
 */
function getPath(inObject, path) {
    var object = inObject;
    // From https://github.com/lodash/lodash/blob/master/.internal/baseGet.js
    var index = 0;
    var length = path.length;
    while (object && index < length) {
        object = object[path[index++]];
    }
    return (index && index === length) ? object : undefined;
}
/**
 * Check if a pgSetting is a string or a number.
 * Null and Undefined settings are not valid and will be ignored.
 * pgSettings of other types throw an error.
 *
 * @private
 */
function isPgSettingValid(pgSetting) {
    var supportedSettingTypes = ['string', 'number'];
    if (supportedSettingTypes.indexOf(typeof pgSetting) >= 0) {
        return true;
    }
    if (pgSetting === undefined || pgSetting === null) {
        return false;
    }
    throw new Error("Error converting pgSetting: " + typeof pgSetting + " needs to be of type " + supportedSettingTypes.join(' or ') + ".");
}
// tslint:enable no-any
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2l0aFBvc3RHcmFwaFFMQ29udGV4dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9wb3N0Z3JhcGhxbC93aXRoUG9zdEdyYXBoUUxDb250ZXh0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsc0NBQXdDO0FBQ3hDLGtDQUFvQztBQUdwQyw2QkFBOEI7QUFFOUIsaUZBQXNFO0FBRXRFOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F3Qkc7QUFDSCxnQ0FDRSxFQWtCQyxFQUNELFFBQXNEO1FBbEJwRCxrQkFBTSxFQUNOLHNCQUFRLEVBQ1Isd0JBQVMsRUFDVCxvQkFBOEIsRUFBOUIsbURBQThCLEVBQzlCLGVBQWtCLEVBQWxCLHVDQUFrQixFQUNsQixnQ0FBYSxFQUNiLDBCQUFVLEVBQ1YsZ0NBQWE7Ozs7O3dCQWNFLHFCQUFNLE1BQU0sQ0FBQyxPQUFPLEVBQUUsRUFBQTs7K0JBQXRCLFNBQXNCO29CQUV2QyxxREFBcUQ7b0JBQ3JELGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQTtvQkFFdkIsdUNBQXVDO29CQUN2QyxxQkFBTSxRQUFRLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFBOztvQkFEN0IsdUNBQXVDO29CQUN2QyxTQUE2QixDQUFBOzs7O29CQUlaLHFCQUFNLHdCQUF3QixDQUFDOzRCQUM1QyxRQUFRLFVBQUE7NEJBQ1IsUUFBUSxVQUFBOzRCQUNSLFNBQVMsV0FBQTs0QkFDVCxZQUFZLGNBQUE7NEJBQ1osT0FBTyxTQUFBOzRCQUNQLGFBQWEsZUFBQTs0QkFDYixVQUFVLFlBQUE7eUJBQ1gsQ0FBQyxFQUFBOzs2QkFSYSxTQVFiO29CQUVLLHFCQUFNLFFBQVE7NEJBQ25CLEdBQUMsZ0NBQVUsSUFBRyxRQUFROzRCQUN0QixnQ0FBYTs0QkFDYixrQkFBTTtnQ0FDTixFQUFBO3dCQUpGLHNCQUFPLFNBSUwsRUFBQTt3QkFLRixxQkFBTSxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFBOztv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