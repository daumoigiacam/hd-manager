const samples = ['Ă¡','Ă ','Ä‘','á»±','áº¿','vĂ ','toĂ¡n','Ä'];
for (const s of samples) {
  console.log('SAMPLE', s, [...s].map(ch => ch + ':' + ch.codePointAt(0).toString(16)).join(' | '));
  const bytesLatin1 = Uint8Array.from([...s].map(ch => ch.codePointAt(0) & 0xff));
  console.log('latin1->utf8', Buffer.from(s,'latin1').toString('utf8'));
  console.log('win1252 decode bytes', new TextDecoder('windows-1252').decode(bytesLatin1));
  console.log('---');
}
