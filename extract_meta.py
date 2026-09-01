import os, sys, json, re, subprocess
from PIL import Image

COLOR_STOP_WORDS = [
    r'\bcor\s*\d+\b', r'\bbright\s*white\b', r'\bsea\s*foam\b', r'\bdark\s*shadow\b',
    r'\bflint\b', r'\boatmeal\b', r'\bzephyr\b', r'\bblack\b', r'\boff\s*white\b',
    r'\bdark\s*blue\b', r'\bdesenvolver\b', r'\bpendente\b', r'\btingir\b',
    r'\bvestir\s*assim\b', r'\bno\s*cabide\b', r'\bsolicitar\b', r'\betiqueta\b',
    r'\bsolapa\b', r'\bbandeira\b', r'\btag\b', r'\bbainha\b', r'\bgola\b',
    r'\bcava\b', r'\bc[oó]s\b', r'\bilh[oó]s\b', r'\bcadinho\b', r'\bcadar[cç]o\b',
    r'\bfornecedor\b', r'\bc[oó]digo\b', r'\blote\b', r'\b\d{2}-\d{4}\b',
    r'\bmc\s*\d{6,}\b', r'\btc\s*\d{2}/\d{4}\b', r'\brotativo\b', r'\bestampa\b',
    r'\bbolso\b', r'\bcaixa\s*de\s*f[oó]sforo\b'
]

def is_color_or_label_line(text):
    if not text:
        return True
    t_lower = text.lower()
    for pat in COLOR_STOP_WORDS:
        if re.search(pat, t_lower):
            return True
    return False

def clean_field(text):
    if not text:
        return ''
    t = text.strip()
    t = re.sub(r'^(Alteração|Alteracao|Modelo|Ref|Item|Estilo|Ficha|Obs)[\s:]*', '', t, flags=re.I).strip()
    t = re.sub(r'(Estilo|Data|C&A|C&amp;A|Palomino|CFC|Winter|Ref).*$', '', t, flags=re.I).strip()
    t = re.sub(r'^[\-_/|.:;,\s\[\]]+|[\-_/|.:;,\s\[\]]+$', '', t).strip()
    return t

def normalize_malha(raw):
    if not raw:
        return ''
    clean = clean_field(raw)
    clean = re.sub(r'\b1/2\s*Malha\b', 'Meia Malha', clean, flags=re.I)
    clean = re.sub(r'\b1/2\b', 'Meia', clean)
    
    # Reject grade numbers matching like '0-3 ao 18-24' or '4 ao 12'
    if re.search(r'\b(0-3|\d+)\s*ao\s*\d+', clean, re.I):
        return 'Meia Malha Penteada'
    
    if re.search(r'\bpolilinho\b', clean, re.I):
        return 'Meia Malha Polilinho'
    if re.search(r'\bmeia\s*malha\s*oe\b', clean, re.I) or re.search(r'\bmalha\s*oe\b', clean, re.I):
        return 'Meia Malha OE'
    if re.search(r'\bmeia\s*malha\s*pent', clean, re.I):
        return 'Meia Malha Penteada'
    if re.search(r'\bmeia\s*malha\s*card', clean, re.I):
        return 'Meia Malha Cardada'
    if re.search(r'\bmeia\s*malha\b', clean, re.I):
        return 'Meia Malha Penteada'
    if re.search(r'\bmalh[aã]o\b', clean, re.I):
        return 'Malhão 180g'
    if re.search(r'\bmolecotton\s*jeans\b', clean, re.I):
        return 'Molecotton Jeans'
    if re.search(r'\bmolecotton\b', clean, re.I):
        return 'Molecotton'
    if re.search(r'\bmoletom\s*3\s*cabos\b', clean, re.I):
        return 'Moletom 3 Cabos'
    if re.search(r'\bmoletom.*(com\s*felpa|c/\s*felpa)\b', clean, re.I):
        return 'Moletom com Felpa'
    if re.search(r'\bmoletom.*(sem\s*felpa|s/\s*felpa)\b', clean, re.I):
        return 'Moletom sem Felpa'
    if re.search(r'\bmoletom\b', clean, re.I):
        return 'Moletom PA'
    if re.search(r'\bmoletinho\b', clean, re.I):
        return 'Moletinho'
    if re.search(r'\bsuedine\b', clean, re.I):
        return 'Suedine Penteado'
    if re.search(r'\batlantic\s*stripe\b', clean, re.I):
        return 'Malha Atlantic Stripe'
    if re.search(r'\bcanelad[oa]\b', clean, re.I):
        return 'Malha Canelada'
    if re.search(r'\bgorgur[aã]o\b', clean, re.I):
        return 'Gorgurão PA'
    if re.search(r'\bribana\b', clean, re.I):
        return 'Ribana'
    if re.search(r'\bmalha\s*favo\b', clean, re.I):
        return 'Malha Favo'
    if re.search(r'\bwaffle\b', clean, re.I):
        return 'Waffle Elegance'
    if re.search(r'\bcotton\b', clean, re.I):
        return 'Cotton com Elastano'
    if re.search(r'\bpiquet\b', clean, re.I):
        return 'Piquet'
    if re.search(r'\bviscose\b|\bviscolycra\b', clean, re.I):
        return 'Viscose'
    if re.search(r'\bmicro\s*touch\b', clean, re.I):
        return 'Malha Micro Touch'
    if re.search(r'\bponto\s*light\b', clean, re.I):
        return 'Malha Ponto Light'
    if re.search(r'\bflam[eê]\b', clean, re.I):
        return 'Malha Flamê'
    if re.search(r'\btnt\s*dry\b', clean, re.I):
        return 'Malha TNT Dry'

    return clean

def normalize_modelagem(raw):
    if not raw:
        return ''
    clean = clean_field(raw)
    
    # Reject grade numbers matching like '0-3 ao 18-24' or '4 ao 12'
    if re.search(r'\b(0-3|\d+)\s*ao\s*\d+', clean, re.I):
        return 'Top MC'

    if re.search(r'\bmach[aã]o\s*box\b|\bmach[aã]o\b', clean, re.I):
        return 'Top Machão Box'
    if re.search(r'\btop\s*mc\s*d\.?\s*200\b', clean, re.I):
        return 'Top MC D.200'
    if re.search(r'\btop\s*mc\s*oversized\b', clean, re.I):
        return 'Top MC Oversized'
    if re.search(r'\btop\s*mc\s*regular\b', clean, re.I):
        return 'Top MC Regular'
    if re.search(r'\btop\s*(mc|curto)\b', clean, re.I) or re.search(r'\bbaby\s*look\b', clean, re.I) or re.search(r'\bcamiseta\b', clean, re.I):
        return 'Top MC'
    if re.search(r'\btop\s*(ml|longo)\b', clean, re.I) or re.search(r'\bblusa\s+ml\b', clean, re.I) or re.search(r'\btop\s+.*\bml\b', clean, re.I):
        return 'Top ML'
    if re.search(r'\bblus[aã]o\s*ml\b|\bblus[aã]o\b', clean, re.I):
        return 'Blusão ML'
    if re.search(r'\bconj.*(top\s*mc|curto).*short', clean, re.I) or re.search(r'\bconj.*curto\b', clean, re.I):
        return 'Conj. Top MC + Shorts'
    if re.search(r'\bconj.*blus[aã]o.*cal[cç]a\b|\bconj.*moletom\b', clean, re.I):
        return 'Conjunto Moletom'
    if re.search(r'\bconj.*polo\b', clean, re.I):
        return 'Conjunto Polo'
    if re.search(r'\bconj.*longo\b', clean, re.I):
        return 'Conjunto Longo'
    if re.search(r'\bcal[cç]a\s*jogger\s*saruel\b', clean, re.I):
        return 'Calça Jogger Saruel'
    if re.search(r'\bcal[cç]a\s*jogger\b', clean, re.I):
        return 'Calça Jogger'
    if re.search(r'\bcal[cç]a\s*clochard\b', clean, re.I):
        return 'Calça Clochard'
    if re.search(r'\bcal[cç]a\b', clean, re.I):
        return 'Calça'
    if re.search(r'\bkit\s*regata\b|\bregata\b', clean, re.I):
        return 'Kit Regata'
    if re.search(r'\bshorts\s*saia\b', clean, re.I):
        return 'Shorts Saia'
    if re.search(r'\bshorts?\b|\bbermuda\b', clean, re.I):
        return 'Shorts'
    if re.search(r'\bjardineira\b', clean, re.I):
        return 'Jardineira'
    if re.search(r'\bbody\s*curto\b|\bbody\s*mc\b', clean, re.I):
        return 'Body Curto'
    if re.search(r'\bbody\s*longo\b|\bbody\s*ml\b', clean, re.I):
        return 'Body Longo'
    if re.search(r'\bmacaquinho\b', clean, re.I):
        return 'Macaquinho'
    if re.search(r'\bvestido\b', clean, re.I):
        return 'Vestido'
    if re.search(r'\bcamisa\s*polo\b|\bpolo\b', clean, re.I):
        return 'Camisa Polo'

    return clean

def process_images(images_dir, output_file):
    valid_exts = {'.jpg', '.jpeg', '.png', '.webp'}
    files = sorted([f for f in os.listdir(images_dir) if os.path.splitext(f)[1].lower() in valid_exts])
    print(f'Total images to inspect: {len(files)}')
    
    metadata = {}
    
    for idx, f in enumerate(files):
        path = os.path.join(images_dir, f)
        base_name = os.path.splitext(f)[0]
        sku = base_name.upper().strip()
        
        try:
            with Image.open(path) as img:
                w, h = img.size
                # Target the absolute bottom 11% (from 89% to 100%)
                crop_box = (0, int(h * 0.88), w, h)
                cropped = img.crop(crop_box)
                tmp_crop = f'/tmp/crop_{idx % 10}.png' if os.name != 'nt' else f'crop_tmp_{idx % 10}.png'
                cropped.save(tmp_crop)
                
                res = subprocess.run(
                    ['tesseract', tmp_crop, 'stdout', '-l', 'por+eng', '--psm', '6'],
                    capture_output=True, text=True
                )
                text = res.stdout.strip()
                
                # If bottom 11% didn't find the slash line, expand to 16% (from 84% to 100%)
                if '/' not in text:
                    crop_box2 = (0, int(h * 0.84), w, h)
                    cropped2 = img.crop(crop_box2)
                    cropped2.save(tmp_crop)
                    res2 = subprocess.run(
                        ['tesseract', tmp_crop, 'stdout', '-l', 'por+eng', '--psm', '6'],
                        capture_output=True, text=True
                    )
                    text = res2.stdout.strip()

                if os.path.exists(tmp_crop):
                    try: os.remove(tmp_crop)
                    except: pass
                
                raw_modelagem = ''
                raw_malha = ''
                raw_grade = ''
                
                lines = [l.strip() for l in text.split('\n') if l.strip()]
                
                # Filter lines from bottom to top to get the specification row
                for line in reversed(lines):
                    # Check if line contains color names or swatches
                    if is_color_or_label_line(line):
                        continue
                    
                    line_norm = re.sub(r'\b1/2\s*Malha\b', 'Meia Malha', line, flags=re.I)
                    line_norm = re.sub(r'\b1/2\b', 'Meia', line_norm)
                    
                    if '/' in line_norm:
                        parts = [clean_field(p) for p in line_norm.split('/') if clean_field(p)]
                        if len(parts) >= 2:
                            p0 = parts[0]
                            p1 = parts[1]
                            # Verify that p0 is not a color
                            if not is_color_or_label_line(p0) and not is_color_or_label_line(p1):
                                raw_modelagem = p0
                                raw_malha = p1
                                if len(parts) >= 3:
                                    raw_grade = parts[2]
                                break
                
                # Normalization
                modelagem_final = normalize_modelagem(raw_modelagem)
                malha_final = normalize_malha(raw_malha)
                
                metadata[sku] = {
                    'sku': sku,
                    'file': f,
                    'modelagem': modelagem_final or 'Top MC',
                    'malha': malha_final or 'Meia Malha Penteada',
                    'grade': raw_grade,
                    'raw_ocr': text
                }
                
                if idx < 10 or idx % 50 == 0:
                    print(f'[{idx+1}/{len(files)}] {sku} -> Modelagem: "{modelagem_final}" | Malha: "{malha_final}"')
        except Exception as e:
            print(f'Error processing {f}: {e}')
            
    with open(output_file, 'w', encoding='utf-8') as out:
        json.dump(metadata, out, ensure_ascii=False, indent=2)
    print(f'Done! Saved metadata for {len(metadata)} items in {output_file}')

if __name__ == '__main__':
    images_dir = sys.argv[1] if len(sys.argv) > 1 else 'images'
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'ficha_metadata.json'
    process_images(images_dir, output_file)
