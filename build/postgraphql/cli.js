#!/usr/bin/env node
"use strict";
var path_1 = require("path");
var fs_1 = require("fs");
var http_1 = require("http");
var chalk = require("chalk");
var program = require("commander");
var pg_connection_string_1 = require("pg-connection-string");
var postgraphql_1 = require("./postgraphql");
// tslint:disable no-console
// TODO: Demo Postgres database
var DEMO_PG_URL = null;
var manifest = JSON.parse(fs_1.readFileSync(path_1.resolve(__dirname, '../../package.json')).toString());
program
    .version(manifest.version)
    .usage('[options...]')
    .description(manifest.description)
    .option('-c, --connection <string>', 'the Postgres connection. if not provided it will be inferred from your environment, example: postgres://user:password@domain:port/db')
    .option('-s, --schema <string>', 'a Postgres schema to be introspected. Use commas to define multiple schemas', function (option) { return option.split(','); })
    .option('-w, --watch', 'watches the Postgres schema for changes and reruns introspection if a change was detected')
    .option('-n, --host <string>', 'the hostname to be used. Defaults to `localhost`')
    .option('-p, --port <number>', 'the port to be used. Defaults to 5000', parseFloat)
    .option('-m, --max-pool-size <number>', 'the maximum number of clients to keep in the Postgres pool. defaults to 10', parseFloat)
    .option('-r, --default-role <string>', 'the default Postgres role to use when a request is made. supercedes the role used to connect to the database')
    .option('-q, --graphql <path>', 'the route to mount the GraphQL server on. defaults to `/graphql`')
    .option('-i, --graphiql <path>', 'the route to mount the GraphiQL interface on. defaults to `/graphiql`')
    .option('-b, --disable-graphiql', 'disables the GraphiQL interface. overrides the GraphiQL route option')
    .option('--token <identifier>', 'DEPRECATED: use --jwt-token-identifier instead')
    .option('-o, --cors', 'enable generous CORS settings. this is disabled by default, if possible use a proxy instead')
    .option('-a, --classic-ids', 'use classic global id field name. required to support Relay 1')
    .option('-j, --dynamic-json', 'enable dynamic JSON in GraphQL inputs and outputs. uses stringified JSON by default')
    .option('-M, --disable-default-mutations', 'disable default mutations, mutation will only be possible through Postgres functions')
    .option('-l, --body-size-limit <string>', 'set the maximum size of JSON bodies that can be parsed (default 100kB) The size can be given as a human-readable string, such as \'200kB\' or \'5MB\' (case insensitive).')
    .option('--secret <string>', 'DEPRECATED: Use jwt-secret instead')
    .option('-e, --jwt-secret <string>', 'the secret to be used when creating and verifying JWTs. if none is provided auth will be disabled')
    .option('-A, --jwt-audiences <string>', 'a comma separated list of audiences your jwt token can contain. If no audience is given the audience defaults to `postgraphql`', function (option) { return option.split(','); })
    .option('--jwt-role <string>', 'a comma seperated list of strings that create a path in the jwt from which to extract the postgres role. if none is provided it will use the key `role` on the root of the jwt.', function (option) { return option.split(','); })
    .option('-t, --jwt-token-identifier <identifier>', 'the Postgres identifier for a composite type that will be used to create JWT tokens')
    .option('--append-plugins <string>', 'a comma-separated list of plugins to append to the list of GraphQL schema plugins')
    .option('--prepend-plugins <string>', 'a comma-separated list of plugins to prepend to the list of GraphQL schema plugins')
    .option('--export-schema-json [path]', 'enables exporting the detected schema, in JSON format, to the given location. The directories must exist already, if the file exists it will be overwritten.')
    .option('--export-schema-graphql [path]', 'enables exporting the detected schema, in GraphQL schema format, to the given location. The directories must exist already, if the file exists it will be overwritten.')
    .option('--show-error-stack [setting]', 'show JavaScript error stacks in the GraphQL result errors')
    .option('--extended-errors <string>', 'a comma separated list of extended Postgres error fields to display in the GraphQL result. Example: \'hint,detail,errcode\'. Default: none', function (option) { return option.split(',').filter(function (_) { return _; }); });
program.on('--help', function () { return console.log("\n  Get Started:\n\n    $ postgraphql --demo\n    $ postgraphql --schema my_schema\n".slice(1)); });
program.parse(process.argv);
// Kill server on exit.
process.on('SIGINT', process.exit);
// Destruct our command line arguments, use defaults, and rename options to
// something appropriate for JavaScript.
var _a = program, _b = _a.demo, isDemo = _b === void 0 ? false : _b, pgConnectionString = _a.connection, watchPg = _a.watch, _c = _a.host, hostname = _c === void 0 ? 'localhost' : _c, _d = _a.port, port = _d === void 0 ? 5000 : _d, maxPoolSize = _a.maxPoolSize, pgDefaultRole = _a.defaultRole, _e = _a.graphql, graphqlRoute = _e === void 0 ? '/graphql' : _e, _f = _a.graphiql, graphiqlRoute = _f === void 0 ? '/graphiql' : _f, _g = _a.disableGraphiql, disableGraphiql = _g === void 0 ? false : _g, deprecatedJwtSecret = _a.secret, jwtSecret = _a.jwtSecret, _h = _a.jwtAudiences, jwtAudiences = _h === void 0 ? ['postgraphql'] : _h, _j = _a.jwtRole, jwtRole = _j === void 0 ? ['role'] : _j, deprecatedJwtPgTypeIdentifier = _a.token, jwtPgTypeIdentifier = _a.jwtTokenIdentifier, _k = _a.cors, enableCors = _k === void 0 ? false : _k, _l = _a.classicIds, classicIds = _l === void 0 ? false : _l, _m = _a.dynamicJson, dynamicJson = _m === void 0 ? false : _m, _o = _a.disableDefaultMutations, disableDefaultMutations = _o === void 0 ? false : _o, exportJsonSchemaPath = _a.exportSchemaJson, exportGqlSchemaPath = _a.exportSchemaGraphql, showErrorStack = _a.showErrorStack, _p = _a.extendedErrors, extendedErrors = _p === void 0 ? [] : _p, bodySizeLimit = _a.bodySizeLimit, appendPluginNames = _a.appendPlugins, prependPluginNames = _a.prependPlugins;
// Add custom logic for getting the schemas from our CLI. If we are in demo
// mode, we want to use the `forum_example` schema. Otherwise the `public`
// schema is what we want.
var schemas = program['schema'] || (isDemo ? ['forum_example'] : ['public']);
// Create our Postgres config.
var pgConfig = Object.assign({}, 
// If we have a Postgres connection string, parse it and use that as our
// config. If we don’t have a connection string use some environment
// variables or final defaults. Other environment variables should be
// detected and used by `pg`.
pgConnectionString || isDemo ? pg_connection_string_1.parse(pgConnectionString || DEMO_PG_URL) : {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    database: process.env.PGDATABASE,
}, 
// Add the max pool size to our config.
{ max: maxPoolSize });
var loadPlugins = function (rawNames) {
    if (!rawNames) {
        return undefined;
    }
    var names = String(rawNames).split(',');
    return names.map(function (rawName) {
        var name = String(rawName);
        var parts = name.split(':');
        var root;
        try {
            root = require(String(parts.shift()));
        }
        catch (e) {
            // tslint:disable-next-line no-console
            console.error("Failed to load plugin '" + name + "'");
            throw e;
        }
        var plugin = root;
        while (true) {
            var part = parts.shift();
            if (part == null) {
                break;
            }
            plugin = root[part];
            if (plugin == null) {
                throw new Error("No plugin found matching spec '" + name + "' - failed at '" + part + "'");
            }
        }
        if (typeof plugin === 'function') {
            return plugin;
        }
        else if (plugin === root && typeof plugin.default === 'function') {
            return plugin.default; // ES6 workaround
        }
        else {
            throw new Error("No plugin found matching spec '" + name + "' - expected function, found '" + typeof plugin + "'");
        }
    });
};
// Create’s our PostGraphQL server and provides all the appropriate
// configuration options.
var server = http_1.createServer(postgraphql_1.default(pgConfig, schemas, {
    classicIds: classicIds,
    dynamicJson: dynamicJson,
    disableDefaultMutations: disableDefaultMutations,
    graphqlRoute: graphqlRoute,
    graphiqlRoute: graphiqlRoute,
    graphiql: !disableGraphiql,
    jwtPgTypeIdentifier: jwtPgTypeIdentifier || deprecatedJwtPgTypeIdentifier,
    jwtSecret: jwtSecret || deprecatedJwtSecret,
    jwtAudiences: jwtAudiences,
    jwtRole: jwtRole,
    pgDefaultRole: pgDefaultRole,
    watchPg: watchPg,
    showErrorStack: showErrorStack,
    extendedErrors: extendedErrors,
    disableQueryLog: false,
    enableCors: enableCors,
    exportJsonSchemaPath: exportJsonSchemaPath,
    exportGqlSchemaPath: exportGqlSchemaPath,
    bodySizeLimit: bodySizeLimit,
    appendPlugins: loadPlugins(appendPluginNames),
    prependPlugins: loadPlugins(prependPluginNames),
}));
// Start our server by listening to a specific port and host name. Also log
// some instructions and other interesting information.
server.listen(port, hostname, function () {
    console.log('');
    console.log("PostGraphQL server listening on port " + chalk.underline(server.address().port.toString()) + " \uD83D\uDE80");
    console.log('');
    console.log("  \u2023 Connected to Postgres instance " + chalk.underline.blue(isDemo ? 'postgraphql_demo' : "postgres://" + pgConfig.host + ":" + (pgConfig.port || 5432) + (pgConfig.database != null ? "/" + pgConfig.database : '')));
    console.log("  \u2023 Introspected Postgres schema(s) " + schemas.map(function (schema) { return chalk.magenta(schema); }).join(', '));
    console.log("  \u2023 GraphQL endpoint served at " + chalk.underline("http://" + hostname + ":" + port + graphqlRoute));
    if (!disableGraphiql)
        console.log("  \u2023 GraphiQL endpoint served at " + chalk.underline("http://" + hostname + ":" + port + graphiqlRoute));
    console.log('');
    console.log(chalk.gray('* * *'));
    console.log('');
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3Bvc3RncmFwaHFsL2NsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBLDZCQUE2QztBQUM3Qyx5QkFBaUM7QUFDakMsNkJBQW1DO0FBQ25DLDZCQUErQjtBQUMvQixtQ0FBcUM7QUFDckMsNkRBQXVFO0FBQ3ZFLDZDQUF1QztBQUV2Qyw0QkFBNEI7QUFFNUIsK0JBQStCO0FBQy9CLElBQU0sV0FBVyxHQUFHLElBQUksQ0FBQTtBQUV4QixJQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGlCQUFZLENBQUMsY0FBVyxDQUFDLFNBQVMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQTtBQUVsRyxPQUFPO0tBQ0osT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7S0FDekIsS0FBSyxDQUFDLGNBQWMsQ0FBQztLQUNyQixXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQztLQUVqQyxNQUFNLENBQUMsMkJBQTJCLEVBQUUsc0lBQXNJLENBQUM7S0FDM0ssTUFBTSxDQUFDLHVCQUF1QixFQUFFLDZFQUE2RSxFQUFFLFVBQUMsTUFBYyxJQUFLLE9BQUEsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBakIsQ0FBaUIsQ0FBQztLQUNySixNQUFNLENBQUMsYUFBYSxFQUFFLDJGQUEyRixDQUFDO0tBQ2xILE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxrREFBa0QsQ0FBQztLQUNqRixNQUFNLENBQUMscUJBQXFCLEVBQUUsdUNBQXVDLEVBQUUsVUFBVSxDQUFDO0tBQ2xGLE1BQU0sQ0FBQyw4QkFBOEIsRUFBRSw0RUFBNEUsRUFBRSxVQUFVLENBQUM7S0FDaEksTUFBTSxDQUFDLDZCQUE2QixFQUFFLDhHQUE4RyxDQUFDO0tBQ3JKLE1BQU0sQ0FBQyxzQkFBc0IsRUFBRSxrRUFBa0UsQ0FBQztLQUNsRyxNQUFNLENB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