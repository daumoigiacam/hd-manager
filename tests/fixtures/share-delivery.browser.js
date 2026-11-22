import {deliverShareFiles,deliverShareText} from '../../development/hd-manager/application/src/utils/shareDelivery.js';
const root=document.getElementById('root');
root.innerHTML='<h1>HD Manager · QA chia sẻ</h1><p>Dữ liệu giả lập, không gửi ra ngoài.</p><label>Tình huống <select id="mode"><option value="success">Nhận đủ bộ</option><option value="partial">Lỗi sau 2 ảnh</option><option value="cancel">Hủy</option><option value="unsupported">Không hỗ trợ cả bộ</option><option value="activation">Quá thời gian chuẩn bị</option></select></label><p><button id="open">Chuẩn bị 4 ảnh đơn đặt</button> <button id="single">Hóa đơn / QR / giao hàng (1 ảnh)</button> <button id="text">Công nợ / báo giá / báo cáo (chữ)</button></p><pre id="events" role="log"></pre><p id="outcome" role="status"></p>';
const mode=document.getElementById('mode'),events=document.getElementById('events'),outcome=document.getElementById('outcome');
let calls=0;
const log=value=>{events.textContent+=JSON.stringify(value)+'\n';};
const navigatorPort={userActivation:{isActive:false},canShare:({files})=>mode.value!=='unsupported'||files.length===1,
 share:({files,text})=>{
  calls++;log({call:calls,count:files?.length||0,names:files?.map(f=>f.name)||[],text:Boolean(text),active:navigator.userActivation?.isActive});
  if(!navigator.userActivation?.isActive)throw Error('NotAllowedError: thiếu thao tác người dùng');
  if(mode.value==='partial')return Promise.reject(Object.assign(Error('Ứng dụng nhận lỗi sau 2 ảnh'),{name:'DataError'}));
  if(mode.value==='cancel')return Promise.reject(Object.assign(Error('user cancelled'),{name:'AbortError'}));
  return Promise.resolve();
 }};
async function images(count){
 const entries=[];
 for(let i=0;i<count;i++){
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=800;const ctx=canvas.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,1000,800);ctx.fillStyle='#3155e7';ctx.fillRect(0,0,1000,100);ctx.fillStyle='white';ctx.font='bold 36px Arial';ctx.fillText('HD MANAGER · ĐƠN ĐẶT QA',30,60);
  ctx.fillStyle='#0f172a';ctx.font='28px Arial';ctx.fillText(`Trang ${i+1}/${count} · dữ liệu giả lập`,30,145);
  for(let row=0;row<12;row++)ctx.fillText(`Khách QA ${i*12+row+1}       VM       10 con       52.000`,30,200+row*44);
  entries.push({name:`don-dat-qa-trang-${i+1}.png`,blob:await new Promise(r=>canvas.toBlob(r,'image/png'))});canvas.width=canvas.height=0;
 }
 if(mode.value==='activation')await new Promise(r=>setTimeout(r,6000));
 return entries;
}
async function save(name,blob){
 const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);log({download:name,bytes:blob.size});return{status:'downloaded'};
}
async function open(count){outcome.textContent='Đang chuẩn bị…';const entries=await images(count);const result=await deliverShareFiles({entries,title:count===4?'Bảng đơn đặt hàng QA':'Hóa đơn QA'},{platform:'web',navigator:navigatorPort,saveFile:save});outcome.textContent='Kết quả: '+result.status;}
document.getElementById('open').onclick=()=>open(4);
document.getElementById('single').onclick=()=>open(1);
document.getElementById('text').onclick=async()=>{const result=await deliverShareText({title:'Công nợ QA',text:'Khách QA · Công nợ 100.000đ'},{platform:'web',navigator:navigatorPort,copy:async text=>{log({copy:text});return true;}});outcome.textContent='Kết quả: '+result.status;};
