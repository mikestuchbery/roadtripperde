
// Importing React and necessary components
import React from 'react';

const Card = ({ stop }) => {
    const { name, lat, lng, wikiLink } = stop;

    // Coordinates for the native map links
    const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const appleMapsLink = `http://maps.apple.com/?q=${lat},${lng}`;
    const openStreetMapLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
    const bingMapsLink = `https://www.bing.com/maps?cp=${lat}~${lng}`;

    return (
        <div className="stop-card">
            <h3>{name}</h3>
            <p><a href={wikiLink} target="_blank" rel="noopener noreferrer">Wikipedia Link</a></p>
            <p><a href={googleMapsLink} target="_blank" rel="noopener noreferrer">Google Maps</a></p>
            <p><a href={appleMapsLink} target="_blank" rel="noopener noreferrer">Apple Maps</a></p>
            <p><a href={openStreetMapLink} target="_blank" rel="noopener noreferrer">OpenStreetMap</a></p>
            <p><a href={bingMapsLink} target="_blank" rel="noopener noreferrer">Bing Maps</a></p>
        </div>
    );
};

export default Card;
