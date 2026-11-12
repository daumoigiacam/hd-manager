import {parse} from '@babel/parser';import traverseModule from '@babel/traverse';
const traverse=traverseModule.default;
const prefix='__hdHomeProjectedSpread';
export function instrumentEmployeeHomeSpreads(source,{guardImport}={}){
 if(typeof source!=='string'||source.includes(prefix))throw Error('Home spread instrumentation requires unchanged source.');
 const tree=parse(source,{sourceType:'module',plugins:['jsx']}),patches=new Map();let spreads=0;
 const add=(position,text,priority)=>{if(!patches.has(position))patches.set(position,[]);patches.get(position).push({text,priority})};
 traverse(tree,{ObjectExpression(p){
  if(!p.node.properties.some(p=>p.type==='SpreadElement'))return;
  spreads++;add(p.node.start,prefix+'Result(',1);add(p.node.end,')',0);
  for(const prop of p.node.properties){if(prop.type!=='SpreadElement')continue;add(prop.argument.start,prefix+'Source(',0);add(prop.argument.end,')',1)}
 }});
 let code=source;
 for(const [position,values]of [...patches].sort((a,b)=>b[0]-a[0]))code=code.slice(0,position)+values.sort((a,b)=>a.priority-b.priority).map(v=>v.text).join('')+code.slice(position);
 if(spreads&&guardImport)code=`import {employeeHomeSpreadSource as ${prefix}Source,employeeHomeSpreadResult as ${prefix}Result} from ${JSON.stringify(guardImport)};\n`+code;
 // Parsing again catches overlap/parenthesis errors before any artifact can be
 // used. No formula, literal, branch or numerical operation is rewritten.
 parse(code,{sourceType:'module',plugins:['jsx']});
 return {code,spreads};
}
// Conservative build-time candidate fields, not proof by themselves. Runtime
// guards remain mandatory, so dynamic/unrecognized access cannot return zero.
export function collectEmployeeHomeCandidateFields(source){
 const tree=parse(source,{sourceType:'module'}),fields=new Set(['id','companyId','isArchived']);
 const add=value=>{if(typeof value==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value))fields.add(value)};
 traverse(tree,{
  'MemberExpression|OptionalMemberExpression'(p){const n=p.node;if(!n.computed&&n.property.type==='Identifier')add(n.property.name);else if(n.computed&&n.property.type==='StringLiteral')add(n.property.value)},
  ObjectProperty(p){if(!p.node.computed)add(p.node.key.name??p.node.key.value)},
  StringLiteral(p){add(p.node.value)},
 });
 if(fields.size>1024)throw Error('Candidate field count exceeds the guarded protocol cap.');
 return [...fields].sort();
}
