import {createCanvas} from '@napi-rs/canvas';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {Document,Packer,Paragraph} from 'docx';
import ExcelJS from 'exceljs';
import {zipSync,strToU8} from 'fflate';
import {writeFile} from 'node:fs/promises';
export async function makeFileFixtures(dir: string) {
const canvas=createCanvas(1200,1000), c=canvas.getContext('2d');
c.fillStyle='white';c.fillRect(0,0,1200,1000);c.fillStyle='#151515';c.font='bold 38px sans-serif';
c.fillText('Fictional QA — Mira Vale',55,75);c.font='28px sans-serif';
for(const [i,line] of ['Product Director | London','mira.vale@example.com','Harbor Labs: 2021–2025','Led onboarding for enterprise SaaS clients','Skills: product strategy, analytics, onboarding'].entries())c.fillText(line,55,145+i*48);
c.fillStyle='#2266cc';c.fillRect(55,450,420,120);c.fillStyle='white';c.fillText('CLIENT UPDATE',90,525);
c.fillStyle='#c64433';c.fillRect(55,640,420,120);c.fillStyle='white';c.fillText('CANDIDATE REVIEW',75,715);
c.fillStyle='#151515';c.fillText('Training diagram — fictional data only',55,900);
const png=canvas.toBuffer('image/png');await writeFile(dir+'qa-profile.png',png);await writeFile(dir+'qa-profile.jpg',canvas.toBuffer('image/jpeg'));await writeFile(dir+'qa-profile.webp',canvas.toBuffer('image/webp'));
const scan=await PDFDocument.create();const image=await scan.embedPng(png);scan.addPage([600,500]).drawImage(image,{x:0,y:0,width:600,height:500});await writeFile(dir+'qa-scan.pdf',await scan.save());
const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);const page=pdf.addPage([600,500]);page.drawText('Fictional QA JD: Product Director, Harbor Labs. Location: London. Requires enterprise SaaS onboarding leadership.',{x:25,y:460,size:9,font});page.drawRectangle({x:50,y:270,width:180,height:100,color:rgb(0.1,0.4,0.8)});page.drawText('Client update',{x:60,y:300,size:16,font,color:rgb(1,1,1)});await writeFile(dir+'qa-text.pdf',await pdf.save());
await writeFile(dir+'qa-notes.docx',await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('Fictional QA client notes: Harbor Labs requires enterprise SaaS onboarding experience. Salary: GBP 120,000. No candidate sharing permission has been given.')]}]})));
const wb=new ExcelJS.Workbook();const s=wb.addWorksheet('Candidates');s.addRow(['Name','Location','Years']);s.addRow(['Mira Vale','London',8]);s.addRow(['Rowan Vale','Dublin',5]);const terms=wb.addWorksheet('Role terms');terms.addRow(['Client','Base salary']);terms.addRow(['Harbor Labs',120000]);await wb.xlsx.writeFile(dir+'qa-candidates.xlsx');
await writeFile(dir+'qa-brief.pptx',zipSync({'ppt/slides/slide1.xml':strToU8('<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Fictional QA client brief</a:t><a:t>Harbor Labs: Product Director, London</a:t></p:sld>')}));
}
