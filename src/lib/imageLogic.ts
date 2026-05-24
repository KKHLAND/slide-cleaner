export type FillMethod = 'solid' | 'stretch-left' | 'stretch-top';

export const removeWatermark = async (
  imageUrl: string,
  width: number,
  height: number,
  marginX: number,
  marginY: number,
  method: FillMethod = 'stretch-left'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      const targetX = Math.max(0, canvas.width - width - marginX);
      const targetY = Math.max(0, canvas.height - height - marginY);

      if (method === 'solid') {
        // Sample just outside the box boundary
        const sampleX = Math.max(0, targetX - 5);
        const sampleY = Math.max(0, targetY - 5);
        const colorData = ctx.getImageData(sampleX, sampleY, 1, 1).data;
        ctx.fillStyle = `rgba(${colorData[0]}, ${colorData[1]}, ${colorData[2]}, ${colorData[3] / 255})`;
        ctx.fillRect(targetX, targetY, width, height);

      } else if (method === 'stretch-left') {
        // Extract a 1px vertical strip just to the left of the area
        const sampleX = Math.max(0, targetX - 1);
        const leftStrip = ctx.getImageData(sampleX, targetY, 1, height);
        
        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = 1;
        stripCanvas.height = height;
        const stripCtx = stripCanvas.getContext('2d');
        if (stripCtx) {
          stripCtx.putImageData(leftStrip, 0, 0);
          ctx.drawImage(stripCanvas, targetX, targetY, width, height);
        }
      } else if (method === 'stretch-top') {
        // Extract a 1px horizontal strip just above the area
        const sampleY = Math.max(0, targetY - 1);
        const topStrip = ctx.getImageData(targetX, sampleY, width, 1);
        
        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = width;
        stripCanvas.height = 1;
        const stripCtx = stripCanvas.getContext('2d');
        if (stripCtx) {
          stripCtx.putImageData(topStrip, 0, 0);
          ctx.drawImage(stripCanvas, targetX, targetY, width, height);
        }
      }
      
      resolve(canvas.toDataURL('image/png', 1.0));
    };
    img.onerror = (e) => reject(e);
    img.src = imageUrl;
  });
};
