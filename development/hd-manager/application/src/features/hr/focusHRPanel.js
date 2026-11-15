// scrollIntoView also scrolls outer WebView/document ancestors, which can put
// the heading behind the native safe area. Move only the nearest content owner.
export function focusHRPanel(panel,heading){
 if(!panel||!heading)return;
 heading.focus({preventScroll:true});
 for(let owner=panel.parentElement;owner&&owner!==document.body;owner=owner.parentElement){
  const style=getComputedStyle(owner);
  if(!/(auto|scroll)/.test(style.overflowY)||owner.scrollHeight<=owner.clientHeight)continue;
  // The existing native shell covers its safe-area padding with a fixed mask.
  // A scrolled child must remain below that padding, not at the border edge.
  const inset=Number.parseFloat(style.paddingTop)||0;
  owner.scrollTop+=panel.getBoundingClientRect().top-owner.getBoundingClientRect().top-inset-12;
  break;
 }
}
