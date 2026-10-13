/**
 * Brand Bucket Command Center — Database Access Layer
 * Modular Supabase client and service pattern.
 */

import { db as coreDb, DatabaseService } from './db-service';
import { supabase, getSupabaseClient } from './supabase-client';
import { supabaseAdmin, getSupabaseServerClient } from './supabase-server';

import * as ordersService from './orders-service';
import * as storesService from './stores-service';
import * as chequesService from './cheques-service';
import * as customersService from './customers-service';
import * as feedbackService from './feedback-service';
import * as returnsService from './returns-service';
import * as beatService from './beat-service';
import * as dispatchService from './dispatch-service';
import * as documentsService from './documents-service';
import * as stockService from './stock-service';
import * as usersService from './users-service';
import * as activityService from './activity-service';
import * as notificationsService from './notifications-service';
import * as analyticsService from './analytics-service';
import * as brandsService from './brands-service';
import * as gpsService from './gps-service';

/**
 * Unified `db` instance supporting all methods.
 */
export const db: DatabaseService = coreDb;

export {
  DatabaseService,
  supabase,
  supabaseAdmin,
  getSupabaseClient,
  getSupabaseServerClient,
  ordersService,
  storesService,
  chequesService,
  customersService,
  feedbackService,
  returnsService,
  beatService,
  dispatchService,
  documentsService,
  stockService,
  usersService,
  activityService,
  notificationsService,
  analyticsService,
  brandsService,
  gpsService,
};

export default db;
