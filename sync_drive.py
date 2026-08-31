"""
Sincronizador Automático de Fotos do Google Drive para o Oneda Ficha Pro
Pasta de Origem no Drive: G:\\Meu Drive\\ONEDA\\APP ONEDA FICHA PRO\\IMAGENS PARA o APP
Pasta de Destino Local: APPs/oneda-ficha-pro/images/
"""

import os
import shutil
import json
import re

# Caminhos
APP_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_IMAGES_DIR = os.path.join(APP_DIR, 'images')
DRIVE_FOLDER = r"G:\Meu Drive\ONEDA\APP ONEDA FICHA PRO\IMAGENS PARA o APP"
IMAGE_MAP_FILE = os.path.join(APP_DIR, 'image_map.json')

def sync_images():
    print("=" * 60)
    print("  ONEDA FICHA PRO - SINCRONIZADOR DE FOTOS DO GOOGLE DRIVE")
    print("=" * 60)
    
    os.makedirs(LOCAL_IMAGES_DIR, exist_ok=True)
    
    if not os.path.exists(DRIVE_FOLDER):
        print(f"\n[AVISO] A pasta do Google Drive não foi encontrada em:\n{DRIVE_FOLDER}")
        print("Verifique se o Google Drive para Desktop está conectado na unidade G:")
        return

    print(f"\n[1/3] Varrendo pasta do Drive:\n-> {DRIVE_FOLDER}")
    
    valid_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'}
    copied_count = 0
    total_drive_files = 0
    image_map = {}

    # Varre recursivamente a pasta do Drive
    for root, dirs, files in os.walk(DRIVE_FOLDER):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in valid_exts:
                total_drive_files += 1
                src_path = os.path.join(root, file)
                dest_path = os.path.join(LOCAL_IMAGES_DIR, file)
                
                # Copia se não existir ou se o tamanho/data for diferente
                should_copy = True
                if os.path.exists(dest_path):
                    src_mtime = os.path.getmtime(src_path)
                    dest_mtime = os.path.getmtime(dest_path)
                    if src_mtime <= dest_mtime and os.path.getsize(src_path) == os.path.getsize(dest_path):
                        should_copy = False
                
                if should_copy:
                    try:
                        shutil.copy2(src_path, dest_path)
                        copied_count += 1
                    except Exception as e:
                        print(f"  [!] Erro ao copiar {file}: {e}")

    # Constrói o image_map a partir das imagens locais
    local_files = os.listdir(LOCAL_IMAGES_DIR)
    for file in local_files:
        ext = os.path.splitext(file)[1].lower()
        if ext in valid_exts:
            sku_raw = os.path.splitext(file)[0].strip()
            sku_upper = sku_raw.upper()
            image_map[sku_upper] = file

            # Mapeamento do código base (sem letras no final)
            base_sku = re.sub(r'[A-Za-z]+$', '', sku_raw).strip().upper()
            if base_sku and base_sku not in image_map:
                image_map[base_sku] = file

    # Salva image_map.json
    with open(IMAGE_MAP_FILE, 'w', encoding='utf-8') as f:
        json.dump(image_map, f, ensure_ascii=False, indent=2)

    print(f"\n[2/3] Total de fotos encontradas no Drive: {total_drive_files}")
    print(f"      Novas fotos copiadas para o App: {copied_count}")
    print(f"      Total de fotos no catálogo local: {len(local_files)}")
    print(f"[3/3] image_map.json atualizado com {len(image_map)} referências mapeadas!")
    print("\n" + "=" * 60)
    print("  SINCRONIZAÇÃO DE FOTOS CONCLUÍDA COM SUCESSO!")
    print("=" * 60)

if __name__ == '__main__':
    sync_images()
