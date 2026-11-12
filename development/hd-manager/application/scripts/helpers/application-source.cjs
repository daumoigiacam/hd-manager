const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const root = path.resolve(__dirname, '../..');
const parseSource = value => parse(value, { sourceType:'module', plugins:['jsx'] });

function namedFunction(node, name) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'FunctionDeclaration' && node.id?.name === name) return node;
  for (const [key, value] of Object.entries(node)) {
    if (['loc','extra','comments','tokens'].includes(key)) continue;
    if (Array.isArray(value)) {for (const child of value) {const found=namedFunction(child,name);if(found)return found;}}
    else if (value?.type) {const found=namedFunction(value,name);if(found)return found;}
  }
  return null;
}

// Static/helper tests inspect the CURRENT production component body in its
// original position, even after code splitting. This is not a baseline or a
// second implementation. Full-App UI/build tests still import the real wrapper.
function readApplicationSource() {
  let source=fs.readFileSync(path.join(root,'src/App.jsx'),'utf8');
  let manifest;
  try {manifest=JSON.parse(fs.readFileSync(path.join(root,'src/features/legacy/view-manifest.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT')return source;throw error;}
  const tree=parseSource(source),edits=[],imports=[],bindings=new Set();
  for(const statement of tree.program.body){
    if(statement.type==='ImportDeclaration')for(const specifier of statement.specifiers)bindings.add(specifier.local.name);
    if(statement.type==='FunctionDeclaration'&&statement.id)bindings.add(statement.id.name);
    if(statement.type==='VariableDeclaration')for(const declaration of statement.declarations)
      if(declaration.id.type==='Identifier')bindings.add(declaration.id.name);
  }
  for(const view of manifest.views){
    const wrapper=tree.program.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name===view.name);
    if(!wrapper||!source.slice(wrapper.start,wrapper.end).includes('module={'+view.moduleVariable+'}'))throw Error('Missing live workspace wrapper: '+view.name);
    const file=path.resolve(root,view.file),relative=path.relative(root,file);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Workspace source outside repository.');
    const componentSource=fs.readFileSync(file,'utf8'),componentTree=parseSource(componentSource),component=namedFunction(componentTree,view.name);
    if(!component)throw Error('Missing actual component implementation: '+view.name);
    // Reconstructed components must retain their real direct imports too.
    // A helper no longer imported by App must not become an unresolved global
    // in this test-only, inlined view of the application.
    for(const statement of componentTree.program.body){
      if(statement.type!=='ImportDeclaration'||!statement.source.value.startsWith('.'))continue;
      const target=path.resolve(path.dirname(file),statement.source.value);
      let targetPath=path.relative(path.join(root,'src'),target).replaceAll('\\','/');
      if(!targetPath.startsWith('.'))targetPath='./'+targetPath;
      for(const specifier of statement.specifiers){
        if(bindings.has(specifier.local.name))continue;
        const text=componentSource.slice(specifier.start,specifier.end);
        imports.push(`import ${specifier.type==='ImportSpecifier'?'{'+text+'}':text} from ${JSON.stringify(targetPath)};`);
        bindings.add(specifier.local.name);
      }
    }
    edits.push({start:wrapper.start,end:wrapper.end,text:componentSource.slice(component.start,component.end)});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  // Append so helpers located before the first extracted view keep the same
  // offsets as the real App source used by scoped integration harnesses.
  return source+'\n'+imports.join('\n');
}

exports.readApplicationSource=readApplicationSource;
exports.readApplicationRootSource=()=>fs.readFileSync(path.join(root,'src/App.jsx'),'utf8');
