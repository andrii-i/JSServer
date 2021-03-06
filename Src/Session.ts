import {randomBytes} from 'crypto';
import {Request, Response} from 'express';

const bytesForToken = 16; 
const sessionDuration = 7200000;

interface User {
   id: number;
   firstName: string;
   lastName: string;
   email: string;
   role: number;
}

export class Session {
   private static ssnsByCookie: {[key: string]: Session} = {}; 
   private static ssnsById: Session[] = [];  
   
   static readonly duration = sessionDuration;    
   static readonly cookieName = 'CHSAuth'; 
   
   static findById = (id:number|string) => Session.ssnsById[id as number];
   static getAllIds = () => Object.keys(Session.ssnsById);
   
   static resetAll = () => {
      Session.ssnsById = [];
      Session.ssnsByCookie = {};
   }

   id: number;
   authToken: string;
   prsId: number;      
   firstName: string;
   lastName: string;
   email: string;
   role: number;
   lastUsed: number;
   loginTime: number;

   constructor(user: User, res: Response) {
      let authToken = randomBytes(bytesForToken).toString('hex');  
      
      res.cookie(Session.cookieName, authToken,
         {maxAge: Session.duration, httpOnly: true }); // 1
      Session.ssnsByCookie[authToken] = this;
      Session.ssnsById.push(this);
      
      this.id = Session.ssnsById.length - 1;
      this.authToken = authToken;
      this.prsId = user.id;
      this.firstName = user.firstName;
      this.lastName = user.lastName;
      this.email = user.email;
      this.role = user.role;
      this.loginTime = this.lastUsed = new Date().getTime();
   };

   static router(req: Request, res: Response, next: Function) {
      var cookie = req.cookies[Session.cookieName];
      var session = cookie && Session.ssnsByCookie[cookie];
      
      if (session) {
         if (session.lastUsed < new Date().getTime() - Session.duration) 
         session.logOut();
         else {
            req.session = session;
         }
      }
      next();
   };
   
   isAdmin() {
      return this.role === 1;
   }

   logOut() {
      delete Session.ssnsById[this.id];
      delete Session.ssnsByCookie[this.authToken];
   };

   clearSsns() {
      Session.ssnsByCookie = {};
      Session.ssnsById = [];
   };

   logOutByPrsId(prsId: number | string) {
      var sessions = Session.ssnsById.filter(ssn => ssn.prsId === 
       parseInt(prsId as string));
      sessions.forEach(ssn => ssn.logOut());
   };
}