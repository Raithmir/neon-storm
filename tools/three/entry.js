// The three.js classes the game uses, bundled by tools/three/bundle.js into
// vendor/three.min.js as the global THREE. Add a class here when a backdrop
// scene (src/backdrop3d.js) needs one, then re-run the bundler.
export {
    REVISION, WebGLRenderer, WebGLRenderTarget, ColorManagement, LinearSRGBColorSpace,
    Scene, Group, Object3D, PerspectiveCamera, Fog, FogExp2, Color,
    Mesh, InstancedMesh, LineSegments, Line, Points,
    BufferGeometry, BufferAttribute, Float32BufferAttribute, InstancedBufferAttribute,
    PlaneGeometry, BoxGeometry, SphereGeometry, IcosahedronGeometry, CylinderGeometry,
    TorusGeometry, RingGeometry, ConeGeometry, EdgesGeometry,
    ShaderMaterial, MeshBasicMaterial, LineBasicMaterial, PointsMaterial,
    Matrix4, Vector2, Vector3, Vector4, Quaternion, Euler, MathUtils,
    AdditiveBlending, NormalBlending, DoubleSide, BackSide, FrontSide,
    DataTexture, CanvasTexture, RepeatWrapping, ClampToEdgeWrapping, LinearFilter, RGBAFormat,
} from 'three';
