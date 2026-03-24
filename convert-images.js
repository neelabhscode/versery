import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';

const poetsDir = './public/poets';

const mapping = {
  'Blake.png': 'william-blake',
  'Burns.png': 'burns',
  'Coleridge.png': 'coleridge',
  'Dickinson.png': 'dickinson',
  'Dunbar.png': 'dunbar',
  'Hafez.png': 'hafez',
  'Herbert.png': 'george-herbert',
  'Hopkins.png': 'hopkins',
  'Kabir.png': 'kabir',
  'Milton.png': 'john-milton',
  'Omar.png': 'omar-khayyam',
  'Owen.png': 'owen',
  'Poe.png': 'poe',
  'Rossetti.png': 'rossetti',
  'Rumi.png': 'rumi',
  'Shakespeare.png': 'shakespeare',
  'Wheately.png': 'wheatley',
  'Whitman.png': 'whitman',
  'Edward': 'edward-thomas'
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
      } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);
      }
    }
  }
  
  // Clean up old PNG/raw files
  console.log('\nCleaning up old files...');
  for (const file of await fs.readdir(poetsDir)) {
    if (file.endsWith('.png') || file === 'Edward') {
      const filePath = path.join(poetsDir, file);
      await fs.remove(filePath);
      console.log(`  Removed ${file}`);
    }
  }
  
  console.log('\n✓ All images converted and cleaned up');
  const jpgCount = (await fs.readdir(poetsDir)).filter(f => f.endsWith('.jpg')).length;
  console.log(`Total JPG images: ${jpgCount}`);
}

convertImages().catch(console.error);
