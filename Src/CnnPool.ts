import {PoolConnection, createPool, Pool, MysqlError} from "mysql";
import {Request, Response} from 'express';
import {kInternalServerErrorHTTP} from "./main";

export class CnnPool {
   static readonly PoolSize = 1
   static singleton = new CnnPool();   
   pool: Pool; 
   
   constructor() {
      var poolCfg = require('./connection.json');

      poolCfg.connectionLimit = CnnPool.PoolSize;
      this.pool = createPool(poolCfg);
   };

   getConnection(cb: (err: MysqlError, connection: PoolConnection) => void) {
      this.pool.getConnection(cb);
   };

   static router(req: Request, res: Response, next: Function) {
      console.log("Getting connection");
      CnnPool.singleton.getConnection(function(err, cnn) {
         if (err) {
            res.status(kInternalServerErrorHTTP)
             .json('Failed to get connection ' + err);
         } else {
            console.log("Connection acquired");
            cnn.chkQry = function(qry, prms, cb) {
               this.query(qry, prms, function(errQuery, qryRes, fields) {
                  if (errQuery) {
                     res.status(kInternalServerErrorHTTP)
                      .json('Failed query ' + qry);
                  }
                  cb(errQuery, qryRes, fields);
               });
            }; 
            req.cnn = cnn;
            next();
         }
      });
   };
}