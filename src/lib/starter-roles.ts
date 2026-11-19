import { D2C_OFFICER_TEMPLATE, FIELD_SALES_OFFICER_TEMPLATE, MANAGER_TEMPLATE, OFFICE_STAFF_TEMPLATE, VIEWER_TEMPLATE } from './permissions';
import { pagesFromFeatures, type AccessMap } from './roles';

/** Ready-made roles to start from. Each is an ordinary role once created and can be changed freely. */
export const STARTER_ROLES: { name: string; description: string; color: string; permissions: AccessMap }[] = [
  { name: 'Manager', description: 'Runs day-to-day operations across online and field sales', color: '#8e3fb8',
    permissions: pagesFromFeatures(MANAGER_TEMPLATE, ['s.money', 's.customers', 's.influencers']) },
  { name: 'Office staff', description: 'Order desk, dispatches, cheques and reviews', color: '#188038',
    permissions: pagesFromFeatures(OFFICE_STAFF_TEMPLATE, ['s.money', 's.customers']) },
  { name: 'D2C officer', description: 'Takes and follows up their own online orders', color: '#1470b0',
    permissions: pagesFromFeatures(D2C_OFFICER_TEMPLATE, ['s.money', 's.customers']) },
  { name: 'Field sales officer', description: 'Visits stores on a beat, takes orders and collects cheques', color: '#a15500',
    permissions: pagesFromFeatures(FIELD_SALES_OFFICER_TEMPLATE, ['s.money']) },
  { name: 'Viewer', description: 'Can look at most pages but change nothing; no sensitive details', color: '#5b5b60',
    permissions: pagesFromFeatures(VIEWER_TEMPLATE) },
];
