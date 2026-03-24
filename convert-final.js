import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';

const poetsDir = './public/poets';

const mapping = {
  'Thomas.png': 'edward-thomas',
  'Keats.png': 'keats'
};

async function convertImages() {
  for (const [oldName, poetId] of Object.entries(mapping)) {
    const inputPath = path.join(poetsDir, oldName);
    const outputPath = path.join(poetsDir, `${poetId}.jpg`);
    
    if (fs.existsSync(inputPath)) {
      try {
        console.log(`Converting ${oldName} → ${poetId}.jpg`);
        await sharp(inputPath)
          .resize(400, 500, { fit: 'cover', position: 'center' })
          .grayscale()
          .jpeg({ quality: 90 })
          .toFile(outputPath);
        console.log(`  ✓ Done`);
        
        // Clean up PNG
        await fs.remove(inputPath);
        console.log(`  Cleaned up ${oldName}`);
      } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);
      }
    } else {
      console.log(`  ✗ ${oldName} not found`);
    }
  }
  
  console.log('\n✓ Complete');
  const jpgCount = (await fs.readdir(poetsDir)).filter(f => f.endsWith('.jpg')).length;
  console.log(`Total JPG images: ${jpgCount}/20`);
}

convertImages().catch(console.error);
