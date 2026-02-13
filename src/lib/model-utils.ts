const MODEL_EXTENSIONS: Record<string, "glb" | "gltf" | "fbx" | "obj"> = {
  ".glb": "glb",
  ".gltf": "gltf",
  ".fbx": "fbx",
  ".obj": "obj",
};

const MODEL_MIME_TYPES = new Set([
  "model/gltf-binary",
  "model/gltf+json",
]);

export function get3DFormat(fileName: string): "glb" | "gltf" | "fbx" | "obj" | null {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return MODEL_EXTENSIONS[ext] ?? null;
}

export function canPreview3D(mimeType: string, fileName: string): boolean {
  if (MODEL_MIME_TYPES.has(mimeType)) return true;
  return get3DFormat(fileName) !== null;
}
