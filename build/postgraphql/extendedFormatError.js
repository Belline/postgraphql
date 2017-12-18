"use strict";
var tslib_1 = require("tslib");
/**
 * Extracts the requested fields from a pg error object, handling 'code' -> 'errcode' mapping.
 */
function pickPgError(err, fields) {
    var result = {};
    if (err && typeof err === 'object') {
        fields.forEach(function (field) {
            // pg places 'errcode' on the 'code' property
            var errField = field === 'errcode' ? 'code' : field;
            result[field] = err[errField] != null ? String(err[errField]) : err[errField];
        });
    }
    return result;
}
/**
 * Given a GraphQLError, format it according to the rules described by the
 * Response Format, Errors section of the GraphQL Specification, plus it can
 * extract additional error codes from the postgres error, such as 'hint',
 * 'detail', 'errcode', 'where', etc. - see `extendedErrors` option.
 */
function extendedFormatError(error, fields) {
    if (!error) {
        throw new Error('Received null or undefined error.');
    }
    var originalError = error.originalError;
    return tslib_1.__assign({}, (originalError && fields ? pickPgError(originalError, fields) : undefined), { message: error.message, locations: error.locations, path: error.path });
}
exports.extendedFormatError = extendedFormatError;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5kZWRGb3JtYXRFcnJvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9wb3N0Z3JhcGhxbC9leHRlbmRlZEZvcm1hdEVycm9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBRUE7O0dBRUc7QUFDSCxxQkFBcUIsR0FBVSxFQUFFLE1BQXFCO0lBQ3BELElBQU0sTUFBTSxHQUFVLEVBQUUsQ0FBQTtJQUN4QixFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksT0FBTyxHQUFHLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztRQUNuQyxNQUFNLENBQUMsT0FBTyxDQUFDLFVBQUMsS0FBYTtZQUMzQiw2Q0FBNkM7WUFDN0MsSUFBTSxRQUFRLEdBQUcsS0FBSyxLQUFLLFNBQVMsR0FBRyxNQUFNLEdBQUcsS0FBSyxDQUFBO1lBQ3JELE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUE7UUFDL0UsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDO0lBQ0QsTUFBTSxDQUFDLE1BQU0sQ0FBQTtBQUNmLENBQUM7QUFFRDs7Ozs7R0FLRztBQUNILDZCQUFvQyxLQUFtQixFQUFFLE1BQXFCO0lBQzVFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNYLE1BQU0sSUFBSSxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQTtJQUN0RCxDQUFDO0lBQ0QsSUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLGFBQXFDLENBQUE7SUFDakUsTUFBTSxzQkFDRCxDQUFDLGFBQWEsSUFBSSxNQUFNLEdBQUcsV0FBVyxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsR0FBRyxTQUFTLENBQUMsSUFDN0UsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQ3RCLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUyxFQUMxQixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksSUFDakI7QUFDSCxDQUFDO0FBWEQsa0RBV0MifQ==