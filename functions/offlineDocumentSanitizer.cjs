// Match the existing Workspace Bootstrap privacy boundary, recursively. This
// does not alter source documents, money, quantities or accounting formulas.
function sanitizeOfflineDocument(value){return JSON.parse(JSON.stringify(value,(key,item)=>/password|secret|token|privatekey|api.?key|credential|salt/i.test(key)?undefined:item));}
module.exports={sanitizeOfflineDocument};
