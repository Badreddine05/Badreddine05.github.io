"""Create the two-page, selectable CV from data/cv.json.

Visual inspiration: https://github.com/jakegut/resume (no template code copied).
Usage: python scripts/render_cv.py
Requires reportlab and pypdf. Never includes a telephone number.
"""
from __future__ import annotations
import json
from pathlib import Path
from html import escape
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether, PageBreak
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'assets/CV_Badreddine_Channoufi.pdf'
PAGE_W, PAGE_H = A4
LEFT, RIGHT = 43, 43
# Platypus' default frame has six points of inner padding on each side.
WIDTH = PAGE_W-LEFT-RIGHT-12
INK=colors.HexColor('#171717')
GRAY=colors.HexColor('#454545')

def clean(text):
    """Normalize only display punctuation unsupported by the standard serif font."""
    return str(text).replace('\u2011','-').replace('\u2013','-').replace('\u2014','-').replace('\u202f',' ').replace('\u00a0',' ')

def txt(text): return escape(clean(text))

STYLES={
 'name':ParagraphStyle('name',fontName='Times-Bold',fontSize=23,leading=26,alignment=TA_CENTER,textColor=INK,spaceAfter=4),
 'subtitle':ParagraphStyle('subtitle',fontName='Times-Roman',fontSize=10.6,leading=13,alignment=TA_CENTER,textColor=INK,spaceAfter=4),
 'contact':ParagraphStyle('contact',fontName='Times-Roman',fontSize=9.5,leading=12,alignment=TA_CENTER,textColor=GRAY,spaceAfter=4),
 'body':ParagraphStyle('body',fontName='Times-Roman',fontSize=10.2,leading=12.6,textColor=INK,spaceAfter=4),
 'bullet':ParagraphStyle('bullet',fontName='Times-Roman',fontSize=10.2,leading=12.5,textColor=INK,leftIndent=10,firstLineIndent=-8,spaceAfter=2.2),
 'heading':ParagraphStyle('heading',fontName='Times-Bold',fontSize=12.6,leading=15,textColor=INK,spaceBefore=12,spaceAfter=3,keepWithNext=True),
 'entry':ParagraphStyle('entry',fontName='Times-Bold',fontSize=10.5,leading=12.8,textColor=INK),
 'date':ParagraphStyle('date',fontName='Times-Roman',fontSize=9.8,leading=12.8,textColor=INK,alignment=TA_RIGHT),
 'org':ParagraphStyle('org',fontName='Times-Italic',fontSize=10,leading=12,textColor=GRAY,spaceAfter=4),
 'projectlink':ParagraphStyle('projectlink',fontName='Times-Roman',fontSize=9.4,leading=11.5,textColor=GRAY,spaceAfter=2),
 'continuation':ParagraphStyle('continuation',fontName='Times-Roman',fontSize=9.5,leading=12,textColor=GRAY,spaceAfter=5),
}

def para(value, style='body', markup=False): return Paragraph(value if markup else txt(value),STYLES[style])

def section(title):
    return [para(title.upper(),'heading'),HRFlowable(width='100%',thickness=.55,color=INK,spaceBefore=0,spaceAfter=6)]

def entry_head(title,dates):
    row=Table([[para(title,'entry'),para(dates,'date')]],colWidths=[WIDTH-143,143],hAlign='LEFT')
    row.setStyle(TableStyle([('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),2),('VALIGN',(0,0),(-1,-1),'TOP')]))
    return row

def link(url,label): return f'<link href="{escape(url,quote=True)}" color="#202020"><u>{txt(label)}</u></link>'

def bullets(items): return [para('- '+txt(item),'bullet',True) for item in items]

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor('#bebebe'));canvas.setLineWidth(.35)
    canvas.line(LEFT,30,PAGE_W-RIGHT,30)
    canvas.setFillColor(GRAY);canvas.setFont('Times-Roman',8)
    canvas.drawString(LEFT,19,'Badreddine Channoufi | Curriculum vitae')
    canvas.drawRightString(PAGE_W-RIGHT,19,str(doc.page))
    canvas.restoreState()

def build():
    data=json.loads((ROOT/'data/cv.json').read_text(encoding='utf-8-sig'))
    # Root verified this omission against the current profile; never infer image-processing experience.
    other=[p for p in data['otherProjects'] if 'vision par ordinateur' not in p.get('title','').lower()]
    story=[para(data['name'],'name'),para(data['title'],'subtitle'),para(data['location'],'contact')]
    contacts=' &nbsp; | &nbsp; '.join([link('mailto:'+data['email'],data['email']),link(data['github'],'GitHub'),link(data['linkedin'],'LinkedIn'),link(data['website'],'Portfolio')])
    story += [para(contacts,'contact',True),Spacer(1,6),para(data['summary'])]
    story += section('Expériences professionnelles')
    for exp in data['experiences']:
        story.append(KeepTogether([entry_head(exp['title'],exp['dates']),para(exp['organization'],'org'),*bullets(exp['items']),Spacer(1,6)]))
    story += section('Formation')
    for edu in data['education']:
        content=[entry_head(edu['title'],edu['dates']),para(edu['organization'],'org')]
        if edu['detail']:content.append(para(edu['detail']))
        content.append(Spacer(1,4));story.append(KeepTogether(content))
    story += section('Compétences')
    for skill in data['skills']:
        story.append(para(f"<b>{txt(skill['title'])} :</b> {txt(skill['detail'])}",markup=True))
    story.append(PageBreak())
    story.append(para(f"<b>{txt(data['name'])}</b> &nbsp; | &nbsp; Projets et compléments",'continuation',True))
    story += section('Projets à explorer')
    for project in data['portfolio']:
        # Link stays in the project title, avoiding an extra line of repetitive link text.
        title=Table([[para(link(project['link'],project['title']),'entry',True),para(project['dates'],'date')]],colWidths=[WIDTH-85,85],hAlign='LEFT')
        title.setStyle(TableStyle([('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),2),('VALIGN',(0,0),(-1,-1),'TOP')]))
        story.append(KeepTogether([title,para(project['tech'],'org'),*bullets(project['items']),Spacer(1,6)]))
    story += section('Autres projets académiques et personnels')
    for project in other:
        title=para(link(project['link'],project['title']),'entry',True) if project.get('link') else para(project['title'],'entry')
        story.append(KeepTogether([title,Spacer(1,2),para(project['detail']),Spacer(1,4)]))
    story += section('Langues et certifications')
    story += [para(data['languages']),para(data['certifications'])]
    story += section("Centres d'intérêt")
    story.append(para(data['interests']))
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    doc=SimpleDocTemplate(str(OUTPUT),pagesize=A4,rightMargin=RIGHT,leftMargin=LEFT,topMargin=34,bottomMargin=42,title='CV - '+data['name'],author=data['name'],subject=data['title'],creator='Retail portfolio CV renderer - ReportLab',pageCompression=1)
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    reader=PdfReader(OUTPUT);text='\n'.join(p.extract_text() for p in reader.pages)
    if len(reader.pages)!=2:raise ValueError(f'Expected 2 balanced pages, got {len(reader.pages)}; inspect layout.')
    if re.search(r'(?:\+33|0)[\s.\-]?[1-9](?:[\s.\-]?\d){8}',text):raise ValueError('Unexpected telephone-like number in public CV')
    required=[data['name'],'RetailScope','GridPulse','FlowLens','NeuroLab','REBOUND','TREND-IT','Linguaskill','Post-it','OptiFin','EEG/BCI','Ethereum','théâtre']
    missing=[value for value in required if value not in text]
    if missing:raise ValueError('Missing expected text: '+str(missing))
    links=[a.get_object().get('/A',{}).get('/URI') for p in reader.pages for a in p.get('/Annots',[])]
    if len([u for u in links if u])<7:raise ValueError('Expected at least 7 clickable email/profile/project links')
    print(json.dumps({'output':str(OUTPUT),'pages':len(reader.pages),'characters':len(text),'clickable_links':len([u for u in links if u]),'telephone_present':False,'required_text_verified':True},ensure_ascii=False,indent=2))

if __name__=='__main__':build()
