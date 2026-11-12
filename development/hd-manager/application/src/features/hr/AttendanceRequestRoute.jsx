import React from 'react';
import AttendanceRequestsWorkspace from './AttendanceRequestsWorkspace.jsx';
export default function AttendanceRequestRoute({runtime,onNavigate}){return <AttendanceRequestsWorkspace runtime={runtime} onClose={()=>onNavigate('home')}/>;}
