import fs from 'node:fs';
import {parse} from '@babel/parser';
import * as roleShared from '../../src/features/payroll/payrollOriginalShared.js';

// Execute the current App's actual pure catalogue/resolvers, including their
// authored default overrides. No browser application or Firebase client loads.
const source=fs.readFileSync(new URL('../../src/App.jsx',import.meta.url),'utf8');
export const roleApplicationSource=source;
const declarations=parse(source,{sourceType:'module',plugins:['jsx']}).program.body;
const named=name=>declarations.find(row=>row.type==='VariableDeclaration'&&row.declarations.some(item=>item.id.name===name));
const start=named('ROLE_PERMISSION_DEPARTMENTS'),end=named('POSITION_SHIFT_DEFAULTS');
if(!start||!end||end.start<=start.start)throw Error('Missing current role model boundary');
const exports=['getEmployeeRolePermissionKey','ROLE_PERMISSION_DEPARTMENTS','ROLE_PERMISSION_GROUPS','ROLE_PERMISSION_MODULES','DEFAULT_ROLE_PERMISSIONS','DEFAULT_ROLE_PERMISSION_ACTIONS',
  'getRolePermissionActionItems','buildPermissionSet','buildPermissionActionSet','normalizePermissionSetForDepartment','normalizeRolePermissions',
  'normalizePermissionActionSetForDepartment','normalizeRolePermissionActions','getCompanyRolePermissions','getCompanyRolePermissionActions',
  'normalizeEmployeeRolePermissions','normalizeEmployeeRolePermissionActions','getCompanyEffectiveRolePermissions','getCompanyEffectiveRolePermissionActions',
  'hasCompanyRolePermission','hasCompanyRolePermissionAction'];
const bindings={...roleShared};
export const roleDomain=Function(...Object.keys(bindings),source.slice(start.start,end.start)+`\nreturn {${exports.join(',')}};`)(...Object.values(bindings));
export const getEmployeeRolePermissionKey=roleDomain.getEmployeeRolePermissionKey;
