import React from 'react';import SalarySettlementsWorkspace from './SalarySettlementsWorkspace.jsx';
export default function SalarySettlementRoute({runtime,onNavigate}){return <SalarySettlementsWorkspace runtime={runtime} onClose={()=>onNavigate('home')}/>;}
