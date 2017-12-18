"use strict";
var tslib_1 = require("tslib");
var pg_1 = require("pg");
var pg_connection_string_1 = require("pg-connection-string");
var events_1 = require("events");
var postgraphile_core_1 = require("postgraphile-core");
var createPostGraphQLHttpRequestHandler_1 = require("./http/createPostGraphQLHttpRequestHandler");
var exportPostGraphQLSchema_1 = require("./schema/exportPostGraphQLSchema");
function postgraphql(poolOrConfig, schemaOrOptions, maybeOptions) {
    var schema;
    var options;
    // If the second argument is undefined, use defaults for both `schema` and
    // `options`.
    if (typeof schemaOrOptions === 'undefined') {
        schema = 'public';
        options = {};
    }
    else if (typeof schemaOrOptions === 'string' || Array.isArray(schemaOrOptions)) {
        schema = schemaOrOptions;
        options = maybeOptions || {};
    }
    else {
        schema = 'public';
        options = schemaOrOptions;
    }
    // Check for a jwtSecret without a jwtPgTypeIdentifier
    // a secret without a token identifier prevents JWT creation
    if (options.jwtSecret && !options.jwtPgTypeIdentifier) {
        // tslint:disable-next-line no-console
        console.warn('WARNING: jwtSecret provided, however jwtPgTypeIdentifier (token identifier) not provided.');
    }
    // Creates the Postgres schemas array.
    var pgSchemas = Array.isArray(schema) ? schema : [schema];
    // Do some things with `poolOrConfig` so that in the end, we actually get a
    // Postgres pool.
    var pgPool = 
    // If it is already a `Pool`, just use it.
    poolOrConfig instanceof pg_1.Pool
        ? poolOrConfig
        : new pg_1.Pool(typeof poolOrConfig === 'string'
            ? pg_connection_string_1.parse(poolOrConfig)
            : poolOrConfig || {});
    var _emitter = new events_1.EventEmitter();
    // Creates a promise which will resolve to a GraphQL schema. Connects a
    // client from our pool to introspect the database.
    //
    // This is not a constant because when we are in watch mode, we want to swap
    // out the `gqlSchema`.
    var gqlSchema;
    var gqlSchemaPromise = createGqlSchema();
    // Finally create our Http request handler using our options, the Postgres
    // pool, and GraphQL schema. Return the final result.
    return createPostGraphQLHttpRequestHandler_1.default(Object.assign({}, options, {
        getGqlSchema: function () { return Promise.resolve(gqlSchema || gqlSchemaPromise); },
        pgPool: pgPool,
        _emitter: _emitter,
    }));
    function createGqlSchema() {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var error_1;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        if (!options.watchPg) return [3 /*break*/, 2];
                        return [4 /*yield*/, postgraphile_core_1.watchPostGraphQLSchema(pgPool, pgSchemas, options, function (newSchema) {
                                gqlSchema = newSchema;
                                _emitter.emit('schemas:changed');
                                exportGqlSchema(gqlSchema);
                            })];
                    case 1:
                        _a.sent();
                        if (!gqlSchema) {
                            throw new Error('Consistency error: watchPostGraphQLSchema promises to call the callback before the promise resolves; but this hasn\'t happened');
                        }
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, postgraphile_core_1.createPostGraphQLSchema(pgPool, pgSchemas, options)];
                    case 3:
                        gqlSchema = _a.sent();
                        exportGqlSchema(gqlSchema);
                        _a.label = 4;
                    case 4: return [2 /*return*/, gqlSchema];
                    case 5:
                        error_1 = _a.sent();
                        return [2 /*return*/, handleFatalError(error_1)];
                    case 6: return [2 /*return*/];
                }
            });
        });
    }
    function exportGqlSchema(newGqlSchema) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var error_2;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, exportPostGraphQLSchema_1.default(newGqlSchema, options)];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_2 = _a.sent();
                        handleFatalError(error_2);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = postgraphql;
function handleFatalError(error) {
    process.stderr.write(error.stack + "\n"); // console.error fails under the tests
    process.exit(1);
    // `process.exit` will mean all code below it will never get called.
    // However, we need to return a value with type `never` here for
    // TypeScript.
    return null;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9zdGdyYXBocWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcG9zdGdyYXBocWwvcG9zdGdyYXBocWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSx5QkFBcUM7QUFDckMsNkRBQXVFO0FBRXZFLGlDQUFxQztBQUNyQyx1REFBbUY7QUFDbkYsa0dBQW9IO0FBQ3BILDRFQUFzRTtBQXFDdEUscUJBQ0UsWUFBeUMsRUFDekMsZUFBNkQsRUFDN0QsWUFBaUM7SUFFakMsSUFBSSxNQUE4QixDQUFBO0lBQ2xDLElBQUksT0FBMkIsQ0FBQTtJQUUvQiwwRUFBMEU7SUFDMUUsYUFBYTtJQUNiLEVBQUUsQ0FBQyxDQUFDLE9BQU8sZUFBZSxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxHQUFHLFFBQVEsQ0FBQTtRQUNqQixPQUFPLEdBQUcsRUFBRSxDQUFBO0lBQ2QsQ0FBQztJQUlELElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLGVBQWUsS0FBSyxRQUFRLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0UsTUFBTSxHQUFHLGVBQWUsQ0FBQTtRQUN4QixPQUFPLEdBQUcsWUFBWSxJQUFJLEVBQUUsQ0FBQTtJQUM5QixDQUFDO0lBR0QsSUFBSSxDQUFDLENBQUM7UUFDSixNQUFNLEdBQUcsUUFBUSxDQUFBO1FBQ2pCLE9BQU8sR0FBRyxlQUFlLENBQUE7SUFDM0IsQ0FBQztJQUVELHNEQUFzRDtJQUN0RCw0REFBNEQ7SUFDNUQsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7UUFDdEQsc0NBQXNDO1FBQ3RDLE9BQU8sQ0FBQyxJQUFJLENBQUMsMkZBQTJGLENBQUMsQ0FBQTtJQUMzRyxDQUFDO0lBRUQsc0NBQXNDO0lBQ3RDLElBQU0sU0FBUyxHQUFrQixLQUFLLENB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