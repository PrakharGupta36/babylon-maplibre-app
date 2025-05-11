import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as BABYLON from "babylonjs";
import "babylonjs-loaders";

interface Map3DModelProps {
  mapTilerKey?: string;
  modelUrl?: string;
  splatUrl?: string; // Added parameter for splat URL
  initialPosition?: [number, number]; // Optional initial position [lng, lat]
}

export default function Map({
  mapTilerKey = "hhddw2CTw2EzhGN7M86x",
  modelUrl = "https://maplibre.org/maplibre-gl-js/docs/assets/34M_17/34M_17.gltf",
  splatUrl = "https://assets.babylonjs.com/splats/gs_Skull.splat", // Default splat URL
  initialPosition = [148.9819, -35.3981],
}: Map3DModelProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Set loading state
    setLoading(true);
    setError(null);

    try {
      // Initialize map
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: `https://api.maptiler.com/maps/basic/style.json?key=${mapTilerKey}`,
        zoom: 18,
        center: initialPosition,
        pitch: 60,
        canvasContextAttributes: { antialias: true }, // Create the GL context with MSAA antialiasing
      });

      // World matrix parameters
      const worldOrigin: [number, number] = initialPosition;
      const worldAltitude = 0;

      // Babylon.js default coordinate system
      // +x east, +y up, +z north
      const worldRotate: [number, number, number] = [Math.PI / 2, 0, 0];

      // Calculate mercator coordinates and scale
      const worldOriginMercator = maplibregl.MercatorCoordinate.fromLngLat(
        worldOrigin,
        worldAltitude
      );
      const worldScale = worldOriginMercator.meterInMercatorCoordinateUnits();

      // Calculate world matrix
      const worldMatrix = BABYLON.Matrix.Compose(
        new BABYLON.Vector3(worldScale, worldScale, worldScale),
        BABYLON.Quaternion.FromEulerAngles(
          worldRotate[0],
          worldRotate[1],
          worldRotate[2]
        ),
        new BABYLON.Vector3(
          worldOriginMercator.x,
          worldOriginMercator.y,
          worldOriginMercator.z
        )
      );

      // Configuration of the custom layer for 3D content
      const customLayer: maplibregl.CustomLayerInterface = {
        id: "3d-content",
        type: "custom",
        renderingMode: "3d",

        onAdd(map: maplibregl.Map, gl: WebGLRenderingContext) {
          // Initialize Babylon engine and scene
          this.engine = new BABYLON.Engine(
            gl as WebGLRenderingContext,
            true,
            {
              useHighPrecisionMatrix: true, // Important to prevent jitter at mercator scale
            },
            true
          );

          this.scene = new BABYLON.Scene(this.engine);
          this.scene.autoClear = false;
          this.scene.detachControl();

          this.scene.beforeRender = () => {
            this.engine.wipeCaches(true);
          };

          // Create camera (will have its projection matrix manually calculated)
          this.camera = new BABYLON.Camera(
            "Camera",
            new BABYLON.Vector3(0, 0, 0),
            this.scene
          );

          // Create lighting
          const light = new BABYLON.HemisphericLight(
            "light1",
            new BABYLON.Vector3(0, 1, 0),
            this.scene
          );
          light.intensity = 0.7;

          const directionalLight = new BABYLON.DirectionalLight(
            "directionalLight",
            new BABYLON.Vector3(0.5, -1, 0.5),
            this.scene
          );
          directionalLight.intensity = 0.5;

          // Add axes viewer for debugging
          new BABYLON.AxesViewer(this.scene, 10);

          // Load 3D model
          if (modelUrl) {
            this.loadModel(modelUrl);
          }

          // Load Gaussian Splat
          if (splatUrl) {
            this.loadSplatFile(splatUrl);
          }

          this.map = map;
        },

        async loadModel(url: string) {
          try {
            const modelContainer =
              await BABYLON.SceneLoader.LoadAssetContainerAsync(
                url,
                "",
                this.scene
              );

            modelContainer.addAllToScene();
            const rootMesh = modelContainer.createRootMesh();

            // Create a second mesh
            const rootMesh2 = rootMesh.clone();

            // Position in babylon.js coordinate system
            rootMesh2.position.x = 25; // +east, meters
            rootMesh2.position.z = 25; // +north, meters
          } catch (error) {
            console.error("Error loading 3D model:", error);
            setError("Failed to load 3D model");
          }
        },

        async loadSplatFile(url: string) {
          try {
            // Import the Gaussian Splat
            BABYLON.ImportMeshAsync(url, this.scene).then((result) => {
              const gaussianSplattingMesh = result.meshes[0];

              // Position the splat in an appropriate location
              // Adjust these values according to your needs
              gaussianSplattingMesh.position = new BABYLON.Vector3(10, 5, 0);

              // Scale the splat (if needed)
              gaussianSplattingMesh.scaling = new BABYLON.Vector3(3, 3, 3);

              console.log("Gaussian Splat loaded successfully");
            });
          } catch (error) {
            console.error("Error loading Gaussian Splat:", error);
            setError("Failed to load Gaussian Splat");
          }
        },

        render(
          _gl: WebGLRenderingContext,
          args: { defaultProjectionData: { mainMatrix: number[] } }
        ) {
          const cameraMatrix = BABYLON.Matrix.FromArray(
            args.defaultProjectionData.mainMatrix
          );

          // World-view-projection matrix
          const wvpMatrix = worldMatrix.multiply(cameraMatrix);

          this.camera.freezeProjectionMatrix(wvpMatrix);

          this.scene.render(false);
          this.map.triggerRepaint();
        },
      } as maplibregl.CustomLayerInterface & {
        engine: BABYLON.Engine;
        scene: BABYLON.Scene;
        camera: BABYLON.Camera;
        map: maplibregl.Map;
        loadModel: (url: string) => Promise<void>;
        loadSplatFile: (url: string) => Promise<void>;
      };

      // Add custom layer when style is loaded
      map.on("style.load", () => {
        map.addLayer(customLayer);
        setLoading(false);
      });

      // Handle error events
      map.on("error", (e) => {
        console.error("Map error:", e);
        setError("Map error occurred");
        setLoading(false);
      });

      mapInstance.current = map;

      // Cleanup on unmount
      return () => {
        map.remove();
      };
    } catch (err) {
      console.error("Error initializing map:", err);
      setError("Failed to initialize map");
      setLoading(false);
    }
  }, [mapTilerKey, modelUrl, splatUrl, initialPosition]);

  return (
    <div
      className='map-container'
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />

      {loading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(255,255,255,0.7)",
            padding: "10px",
            borderRadius: "4px",
          }}
        >
          Loading...
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(255,50,50,0.7)",
            color: "white",
            padding: "10px",
            borderRadius: "4px",
          }}
        >
          Error: {error}
        </div>
      )}
    </div>
  );
}
