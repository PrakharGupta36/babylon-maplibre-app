import Map from "./components/Map";
import "./App.css";

export default function App() {
  return (
    <div className='app-container'>
      <Map
        mapTilerKey='hhddw2CTw2EzhGN7M86x'
        initialPosition={[148.9819, -35.3981]}
      />
    </div>
  );
}
