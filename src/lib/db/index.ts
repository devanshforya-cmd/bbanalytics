/** The shared application store. Privileged clients stay in server route imports. */
import { db } from './db-service';
export { db, DatabaseService } from './db-service';
export default db;
