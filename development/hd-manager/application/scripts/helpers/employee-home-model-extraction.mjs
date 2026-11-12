import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {extractEmployeeHomeDomain} from './employee-home-domain-extraction.mjs';
const traverse=traverseModule.default;
const browserBindings=new Set(['reviewSectionRef','payrollPdfRef','payrollPdfStatus','handleCreatePayrollPdf','handleOpenReviewSection']);

// Build-time extraction of the EXISTING screen's pure data calculations.
// This is groundwork for a compact read model, NOT a public DTO serializer.
// In particular its employee/review/record objects still require an explicit
// response allowlist before any future cloud endpoint can expose this model.
export function extractEmployeeHomeScreenModel(source,sourceDirectory,additionalDomainRoots=[]){
 const tree=parse(source,{sourceType:'module',plugins:['jsx']});let view,program;
 traverse(tree,{Program(p){program=p},FunctionDeclaration(p){if(p.node.id?.name==='EmployeePersonalHomeView'){view=p;p.skip()}}});
 if(!view||view.node.params.length!==1||view.node.params[0].type!=='ObjectPattern')throw Error('Personal Home screen signature unavailable.');
 const returned=view.get('body.body').find(p=>p.isReturnStatement());if(!returned?.node.argument)throw Error('Personal Home render root unavailable.');
 const roots=new Set(),locals=new Map(),external=new Set(),parameters=new Set(),globals=new Set();
 returned.traverse({ReferencedIdentifier(p){
  const name=p.node.name,binding=p.scope.getBinding(name);
  if(binding?.scope===view.scope&&binding.kind!=='param'&&!browserBindings.has(name))roots.add(name);
 }});
 if(!roots.has('details')||!roots.has('reviewSummary')||!roots.has('employeeDeliveryMonthSummary'))throw Error('Personal Home data contract changed.');
 const queue=[...roots];
 const reference=ref=>{
  const name=ref.node.name,binding=ref.scope.getBinding(name);
  if(!binding){globals.add(name);return}
  if(binding.scope===program.scope){external.add(name);return}
  if(binding.scope!==view.scope)return;
  if(binding.kind==='param'){if(name!=='computedHome')parameters.add(name);return}
  if(browserBindings.has(name))throw Error('Browser state entered Home data calculation: '+name);
  if(!locals.has(name))queue.push(name);
 };
 const visit=p=>{if(p.isReferencedIdentifier())reference(p);p.traverse({JSXElement(){throw Error('UI entered the Home data model')},ReferencedIdentifier:reference})};
 while(queue.length){
  const name=queue.shift();if(locals.has(name))continue;
  const binding=view.scope.getBinding(name),p=binding?.path;
  if(!p||binding.scope!==view.scope||!p.isVariableDeclarator()||p.node.id.type!=='Identifier')throw Error('Unsupported Home model binding: '+name);
  let expression=p.get('init');if(!expression.node)throw Error('Missing Home initializer: '+name);
  let text=source.slice(expression.node.start,expression.node.end);
  if(expression.isCallExpression()&&expression.node.callee.type==='Identifier'&&expression.node.callee.name==='useMemo'){
   expression=expression.get('arguments.0');
   if(!expression?.isArrowFunctionExpression())throw Error('Unsupported Home memo: '+name);
   text='('+source.slice(expression.node.start,expression.node.end)+')()';
  }
  locals.set(name,{start:p.node.start,text:'const '+name+' = '+text+';'});visit(expression);
 }
 const permitted=new Set(['Array','Boolean','Date','Intl','Map','Math','Number','Object','Set','String','undefined']);
 for(const name of globals)if(!permitted.has(name))throw Error('Unexpected Home model global: '+name);
 const props=[];
 for(const p of view.node.params[0].properties){
  if(p.type!=='ObjectProperty'||p.computed)throw Error('Unsupported Home parameter.');
  const name=p.value.type==='AssignmentPattern'?p.value.left.name:p.value.name;
  if(!parameters.has(name))continue;
  props.push(source.slice(p.start,p.end));
  if(p.value.type==='AssignmentPattern'){
   // This screen's only nonliteral data default is the current date helper.
   if(p.value.right.type==='CallExpression'&&p.value.right.callee.type==='Identifier')external.add(p.value.right.callee.name);
   else if(!['NullLiteral','ObjectExpression','ArrayExpression','BooleanLiteral','StringLiteral','NumericLiteral'].includes(p.value.right.type))throw Error('Unsupported Home data default: '+name);
  }
 }
 const fields=[...roots];
 const dependencies=extractEmployeeHomeDomain(source,sourceDirectory,[...new Set([...external,...additionalDomainRoots])]);
 const body=[...locals.values()].sort((a,b)=>a.start-b.start).map(v=>v.text).join('\n');
 return {fields,parameters:[...parameters],domainRoots:[...new Set([...external,...additionalDomainRoots])],code:dependencies+'\nexport function buildEmployeeHomeScreenModel({'+props.join(',')+'}){\nconst computedHome=null;\n'+body+'\nreturn {'+fields.join(',')+'};\n}'};
}
