import express, {Request, Response} from "express";
import {series} from "async";
import {queryCallback} from "mysql";
import {Session} from "./Session";
import {Validator} from "./Validator";
import {CnnPool} from "./CnnPool";
import path from "path";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";

export const kNotFoundHTTP = 404;
export const kSuccessHTTP = 200;
export const kBadRequestHTTP = 400;
export const kUnathorizedHTTP = 401;
export const kForbiddenHTTP = 403;
export const kInternalServerErrorHTTP = 500;
export const defaultPort = 3000;
const portArgNum = 3;
const port = process.argv[2] === '-p' && process.argv[portArgNum] || 
 defaultPort;
 
var app = express(); 

app.use(express.static(path.join(__dirname, "public")));

app.use(function(req, res, next) {
   console.log("Handling " + req.path + "/" + req.method);
   res.header("Access-Control-Allow-Origin", "http://localhost:3000");
   res.header("Access-Control-Allow-Credentials", "true");
   res.header("Access-Control-Allow-Headers", "Content-Type");
   res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE");
   res.header("Access-Control-Expose-Headers", "Content-Type, Location");
   res.header("Keep-Alive", "0");
   next();
});

app.options("/*", function(req, res) {
   res.status(kSuccessHTTP).end();
});

app.use(bodyParser.json());

app.use(function(req, res, next) {
   delete req.body.id; 
   next();
});

app.use(cookieParser());

app.use(Session.router);

app.use(function(req, res, next) {
   if (req.session || (req.method === "POST" &&
    (req.path === "/Prss" || req.path === "/Ssns"))) {
      req.validator = new Validator(req, res);
      next();
   } else
      res.status(kUnathorizedHTTP).end();
});

app.use(CnnPool.router);

app.use("/Prss", require("./Account/Prss").router);
app.use("/Ssns", require("./Account/Ssns").router);
app.use("/Cnvs", require("./Conversation/Cnvs").router);
app.use("/Msgs", require("./Conversation/Msgs").router);

app.delete("/DB", function(req, res) {
   var admin = req.session.isAdmin();
   var cbs = ["Message", "Conversation", "Person", "Likes"].map(
      table => function(cb: queryCallback) {
         req.cnn.query("delete from " + table, cb);
      }
   );   

   cbs = cbs.concat(
      ["Conversation", "Message", "Person", "Likes"].map(
         table => cb => {
            console.log("b");
            req.cnn.query("alter table " + table + " auto_increment = 1", cb);
         }
      ));

   cbs.push((cb) => {
      req.cnn.query("INSERT INTO Person (firstName, lastName, email," +
       " password, whenRegistered, role) VALUES " +
       "(\"Joe\", \"Admin\", \"adm@11.com\",\"password\", NOW(), 1)", cb);
   });

   cbs.push(cb => {
      req.session.clearSsns();
      cb(null);
   });

   if (admin) {
      series(cbs, err => {
         if (err) {
            res.status(kBadRequestHTTP).json(err);
         } else {
            res.status(kSuccessHTTP).end();
         }
      });
   } else if (req.session && !admin) {
      res.status(kForbiddenHTTP).end();
   } else {
      res.status(kUnathorizedHTTP).end();
   }
   req.cnn.release();
});

app.use(function(req, res) {
   res.status(kNotFoundHTTP).end();
   req.cnn && req.cnn.release();
});

app.use(function(err: Error, req: Request, res: Response, next: Function) {
   res.status(kInternalServerErrorHTTP).json(err.stack);
   req.cnn && req.cnn.release();
});

app.listen(parseInt(port as string), function() {
   console.log("App Listening on port " + port as string);
});