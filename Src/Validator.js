// Create a validator that draws its session from |req|, and reports
// errors on |res|
var Validator = function(req, res) {
   this.errors = [];   // Accumulated error objects[] having tag and params
   this.session = req.session; //for administrative checking where needed
   this.res = res; // To provide response to the user
};

// "Static" list of errors, and their corresponding resource string tags
Validator.Tags = { 
   noLogin: "noLogin",              // No active session/login
   noPermission: "noPermission",    // Login lacks permission.
   missingField: "missingField",    // Field missing. Params[0] is field name
   badValue: "badValue",            // Bad field value.  Params[0] is field name
   notFound: "notFound",            // Entity not present in DB
   badLogin: "badLogin",            // Email/password combination invalid
   dupEmail: "dupEmail",            // Email duplicates an existing email
   noTerms: "noTerms",              // Acceptance of terms is required.
   forbiddenRole: "forbiddenRole",  // Cannot set to this role
   noOldPwd: "noOldPwd",            // Password change requires old password
   oldPwdMismatch: "oldPwdMismatch",
   dupTitle: "dupTitle",            // Title duplicates an existing cnv title
   queryFailed: "queryFailed",
   forbiddenField: "forbiddenField",
   resourceNotFound : "resourceNotFound",
   dupLike : "dupLike",
   emptyArray : "emptyArray"
};

// Check |test|.  If false, add an error with tag and possibly empty array
// of qualifying parameters, e.g. name of missing field if tag is
// Tags.missingField.
//
// Regardless, check if any errors have accumulated, and if so, close the
// response with a 400 and a list of accumulated errors, and throw
//  this validator as an error to |cb|, if present.  Thus,
// |check| may be used as an "anchor test" after other tests have run w/o
// immediately reacting to accumulated errors (e.g. checkFields and chain)
// and it may be relied upon to close a response with an appropriate error
// list and call an error handler (e.g. a waterfall default function),
// leaving the caller to cover the "good" case only.
Validator.prototype.check = function(test, tag, params, cb) {
   if (!test)
      this.errors.push({tag: tag, params: params}); // Push error object 

   if (this.errors.length) { // If errors is not empty
      if (this.res) { // If response object is present and was not e.g. null-ed
         if (this.errors[0].tag === Validator.Tags.noPermission)
            this.res.status(403).end(); // Close response with 403 code
         else if (this.errors[0].tag === Validator.Tags.resourceNotFound) {
            this.res.status(404).end();
         } else if (this.errors[0].tag === Validator.Tags.emptyArray) {
            this.res.json([]);
         } else this.res.status(400).json(this.errors); // Close w 400 and err
         this.res = null;   // Preclude repeated closings
      }
      if (cb) 
         cb(this); // Callback with truth-y itself as a 1st (error) argument
   }
   return !this.errors.length; // Always returns number of errors
};

// Somewhat like |check|, but designed to allow several chained checks
// in a row, finalized by a check call.
Validator.prototype.chain = function(test, tag, params) {
   if (!test) {
      this.errors.push({tag: tag, params: params});
   }
   return this; // Returns Validator to be able to continue chaining
};

Validator.prototype.checkAdmin = function(cb) {
   return this.check(this.session && this.session.isAdmin(),
      Validator.Tags.noPermission, null, cb);
};

// Validate that AU is the specified person or is an admin
Validator.prototype.checkPrsOK = function(claimedId, cb) {
   return this.check(this.session &&
    parseInt(this.session.prsId, 10) === parseInt(claimedId, 10) ||
    this.checkAdmin(),
    Validator.Tags.noPermission, null, cb);
};

// Check presence of truthy property in |obj| for all fields in fieldList
Validator.prototype.hasFields = function(obj, fieldList, cb) {
   var self = this;

   fieldList.forEach(function(name) {
      self.chain(obj.hasOwnProperty(name), Validator.Tags.missingField, [name]);
   });

   return this.check(true, null, null, cb);
};

// Check presence of truthy property in |obj| for all fields in fieldList
Validator.prototype.hasDefinedFields = function(obj, fieldNames, cb) {
   var self = this;
   var i = 0;
   for (i = 0; i < fieldNames.length; i++) {
      self.chain(obj.hasOwnProperty(fieldNames[i]) && 
       this.hasValue(obj[fieldNames[i]]), Validator.Tags.missingField, 
       [fieldNames[i]]);
   }
   return this.check(true, null, null, cb);
};

Validator.prototype.hasValue = function(field) {
   return (field !== null && field !== "" && field !== undefined);
};

module.exports = Validator;
