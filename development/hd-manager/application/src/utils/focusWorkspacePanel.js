// Move only the nearest content owner. scrollIntoView can also scroll the
// outer WebView and place the heading behind the native safe-area mask.
export function focusWorkspacePanel(panel,heading){
 if(!panel||!heading)return;
 heading.focus({preventScroll:true});
 for(let owner=panel.parentElement;owner&&owner!==document.body;owner=owner.parentElement){
  const style=getComputedStyle(owner);
  if(!/(auto|scroll)/.test(style.overflowY)||owner.scrollHeight<=owner.clientHeight)continue;
  const inset=Number.parseFloat(style.paddingTop)||0;
  owner.scrollTop+=panel.getBoundingClientRect().top-owner.getBoundingClientRect().top-inset-12;
  break;
 }
}
