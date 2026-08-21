from PIL import Image

try:
    img = Image.open('public/brand/vkon-logo-round.jpeg')
    
    if img.mode != 'RGB':
        img = img.convert('RGB')
        
    bg_color = img.getpixel((0, 0))
    
    new_img = Image.new('RGB', (1200, 630), bg_color)
    
    new_size = 630
    img_resized = img.resize((new_size, new_size), Image.LANCZOS)
    
    x = (1200 - new_size) // 2
    y = 0
    new_img.paste(img_resized, (x, y))
    
    new_img.save('public/brand/vkon-og-banner.jpeg', quality=95)
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {e}")
