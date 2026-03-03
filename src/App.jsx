import React from 'react';
import DrivingScene from './DrivingScene';
import Card from './Card';
import JourneyMap from './JourneyMap';
import KofiButton from './KofiButton';
import './App.css';

function App() {
    return (
        <div className="app">
            <h1>Road Trip Planner</h1>
            <DrivingScene />
            <Card />
            <JourneyMap />
            <KofiButton />
        </div>
    );
}

export default App;