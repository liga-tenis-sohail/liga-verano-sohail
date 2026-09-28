'use strict';
// Executed only by the isolated dependency preflight after the official download.
async function main(){
const assert=require('node:assert/strict');
const X=require(process.argv[2]);const S=require('../../public/import-security');
assert.equal(X.version,'0.20.3');
const book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['Jugador','Puntos'],['Álvaro',3],['LES',0]]),'Resultados');
const bytes=X.write(book,{type:'buffer',bookType:'xlsx',compression:true});
assert.ok((await S.verifyExpanded(new Uint8Array(bytes))).entries>0);S.protect(X);
const result=X.read(new Uint8Array(bytes),{type:'array'});
assert.deepEqual(X.utils.sheet_to_json(result.Sheets.Resultados,{header:1}),[['Jugador','Puntos'],['Álvaro',3],['LES',0]]);
console.log('Official SheetJS 0.20.3 write / bounded preflight / read round-trip passed.');

}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
