import React from 'react';import AttendancePeriodsWorkspace from './AttendancePeriodsWorkspace.jsx';
export default function AttendancePeriodRoute({runtime,onNavigate}){return <AttendancePeriodsWorkspace runtime={runtime} onClose={()=>onNavigate('home')}/>;}
