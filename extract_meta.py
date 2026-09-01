import os, sys, json, re, subprocess
from PIL import Image

def clean_field(text):
    if not text:
        return ''
    t = text.strip()
    t = re.sub(r'^(Alteração|Alteracao|Modelo|Ref|Item|Estilo|Ficha|Obs)[\s:]*', '', t, flags=re.I).strip()
    t = re.sub(r'(Estilo|Data|C&A|C&amp;A|Palomino|CFC|Winter|Ref).*$', '', t, flags=re.I).strip()
    t = re.sub(r'^[\-_/|.:;,\s]+|[\-_/|.:;,\s]+$', '', t).strip()
    return t

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
                # Bottom 18% where footer with Alteracao / Modelagem / Malha is placed
                crop_box = (0, int(h * 0.82), w, h)
                cropped = img.crop(crop_box)
                tmp_crop = f'/tmp/crop_{idx % 10}.png' if os.name != 'nt' else f'crop_tmp_{idx % 10}.png'
                cropped.save(tmp_crop)
                
                res = subprocess.run(
                    ['tesseract', tmp_crop, 'stdout', '-l', 'por+eng', '--psm', '6'],
                    capture_output=True, text=True
                )
                text = res.stdout.strip()
                
                if os.path.exists(tmp_crop):
                    try: os.remove(tmp_crop)
                    except: pass
                
                modelagem = ''
                malha = ''
                grade = ''
                
                lines = [l.strip() for l in text.split('\n') if l.strip()]
                for line in lines:
                    # Replace 1/2 Malha with Meia Malha to avoid splitting by /
                    line_norm = re.sub(r'1/2s*Malha', 'Meia Malha', line, flags=re.I)
                    line_norm = re.sub(r'1/2', 'Meia', line_norm)
                    
                    if '/' in line_norm and not line_norm.startswith('http'):
                        parts = [clean_field(p) for p in line_norm.split('/') if clean_field(p)]
                        if len(parts) >= 2:
                            # Verify parts
                            p0 = parts[0]
                            p1 = parts[1]
                            # If p0 has Cor or Alteracao, clean further
                            p0 = re.sub(r'^.*(Alteração|Alteracao|Observação|Observacao)[:s]*', '', p0, flags=re.I).strip()
                            if p0 and p1:
                                modelagem = p0
                                malha = p1
                                if len(parts) >= 3:
                                    grade = parts[2]
                                break
                
                # Heuristic search across all lines if modelagem/malha still empty
                if not modelagem:
                    for l in lines:
                        if '/' in l:
                            l_norm = re.sub(r'1/2', 'Meia', l)
                            parts = [clean_field(p) for p in l_norm.split('/') if clean_field(p)]
                            if parts:
                                modelagem = parts[0]
                                if len(parts) > 1 and not malha:
                                    malha = parts[1]
                                break
                
                metadata[sku] = {
                    'sku': sku,
                    'file': f,
                    'modelagem': modelagem,
                    'malha': malha,
                    'grade': grade,
                    'raw_ocr': text
                }
                
                if idx < 10 or idx % 50 == 0:
                    print(f'[{idx+1}/{len(files)}] {sku} -> Modelagem: "{modelagem}" | Malha: "{malha}" | Grade: "{grade}"')
        except Exception as e:
            print(f'Error processing {f}: {e}')
            
    with open(output_file, 'w', encoding='utf-8') as out:
        json.dump(metadata, out, ensure_ascii=False, indent=2)
    print(f'Done! Saved metadata for {len(metadata)} items in {output_file}')

if __name__ == '__main__':
    images_dir = sys.argv[1] if len(sys.argv) > 1 else 'images'
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'ficha_metadata.json'
    process_images(images_dir, output_file)
