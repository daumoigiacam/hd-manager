import {Fragment,memo} from 'react';
// Keep one Home tree for the current permission scope. Hidden routes cannot
// start new Home calculations; returning delivers the latest source references.
export default memo(function RetainedReadOnlyHome({children,privacyScope}){return <Fragment key={privacyScope}>{children}</Fragment>},
 (previous,next)=>!next.isActive&&previous.privacyScope===next.privacyScope);
