import {parse} from '@babel/parser';
import {sortProjection} from '../../src/services/cooperativeProjection.js';
import {searchRecords} from '../../src/services/searchEngine.js';
export function extractDispatchRanking(source){
 const wanted=new Set(['normalizeLookupText','collapseLookupText','tokenizeLookupText','levenshteinDistance','buildTranscriptSearchCandidates','scoreLookupTextMatch','rankDispatchPickerOptions']);
 const nodes=new Map(),stack=[parse(source,{sourceType:'module',plugins:['jsx']})];
 while(stack.length){const node=stack.pop();if(!node||typeof node!=='object')continue;
  if(node.type==='VariableDeclarator'&&wanted.has(node.id?.name))nodes.set(node.id.name,node.init);
  for(const value of Object.values(node))if(Array.isArray(value))stack.push(...value);else if(value&&typeof value==='object'&&value.type)stack.push(value);
 }
 const bindings={LOOKUP_NORMALIZATION_MAX_LENGTH:256,LOOKUP_NORMALIZATION_CACHE_LIMIT:2048,lookupNormalizationCache:new Map(),sortProjection,searchSharedRecords:searchRecords};
 for(const name of wanted){const node=nodes.get(name);if(!node)throw Error('Missing real source binding: '+name);const expression=node.type==='CallExpression'?node.arguments[0]:node;
  bindings[name]=new Function(...Object.keys(bindings),`return (${source.slice(expression.start,expression.end)})`)(...Object.values(bindings));
 }
 return bindings.rankDispatchPickerOptions;
}
