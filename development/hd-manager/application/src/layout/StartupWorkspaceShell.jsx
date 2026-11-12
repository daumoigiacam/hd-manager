import React,{useLayoutEffect} from 'react';
import {startupMark} from '../services/offlineStartupTrace.js';
import './startup-workspace-shell.css';
// Public structure only: no identity, tenant, report, repository or cache reads.
export default function StartupWorkspaceShell({onLogout,error=''}){
 useLayoutEffect(()=>{startupMark('shell.react-commit');},[]);
 return <main className="hd-startup-workspace" data-hd-startup-shell="true" aria-label="Đang khởi tạo Workspace" aria-busy="true">
  <header><strong>HD Manager</strong>{onLogout&&<button type="button" onClick={onLogout}>Đăng xuất</button>}</header>
  <section><h1>Không gian làm việc</h1><p role="status">Đang khôi phục phiên và xác minh quyền truy cập…</p><p>Dữ liệu chỉ mở sau khi xác minh tài khoản và doanh nghiệp.</p>{error&&<p role="alert">{error}</p>}</section>
  <nav aria-label="Điều hướng đang khởi tạo">{['Trang chủ','Khách hàng','Đơn hàng','Chức năng'].map(label=><button disabled key={label}>{label}</button>)}</nav>
 </main>;
}
