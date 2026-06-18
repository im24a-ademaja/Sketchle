import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import CanvasDraw from 'react-canvas-draw';

const DrawingCanvas = forwardRef(function DrawingCanvas({ onSubmit, disabled = false }, ref) {
  const canvasRef = useRef(null);

  const getImageData = () => {
    if (!canvasRef.current?.canvasContainer?.children?.[1]) return null;
    return canvasRef.current.canvasContainer.children[1].toDataURL();
  };

  useImperativeHandle(ref, () => ({
    getImageData,
  }));

  const clearCanvas = () => {
    if (canvasRef.current) {
      canvasRef.current.clear();
    }
  };

  const undoCanvas = () => {
    if (canvasRef.current) {
      canvasRef.current.undo();
    }
  };

  const submitCanvas = () => {
    const dataUrl = getImageData();
    if (dataUrl) {
      onSubmit(dataUrl);
    }
  };

  return (
    <div>
      <CanvasDraw
        ref={canvasRef}
        canvasWidth={500}
        canvasHeight={400}
        brushRadius={2}
        lazyRadius={0}
        brushColor="#000000"
        disabled={disabled}
      />
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button onClick={undoCanvas} disabled={disabled}>Undo</button>
        <button onClick={clearCanvas} disabled={disabled}>Clear</button>
        <button onClick={submitCanvas} disabled={disabled}>Abgeben</button>
      </div>
    </div>
  );
});

export default DrawingCanvas;