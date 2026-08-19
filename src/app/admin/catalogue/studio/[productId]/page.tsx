"use client";

import React from 'react';
import ProductStudioEditor from '../../_components/ProductStudioEditor';

/**
 * DFX Product Studio — a focused product catalogue editor:
 * Upload image → enter essential details → see the live customer preview → save.
 * The former multi-step image workflow (Auto Fit / Image Processing / crop /
 * Preview & Export) has been retired; the editor is a single clean screen.
 */
export default function ProductStudioPage() {
  return <ProductStudioEditor />;
}
