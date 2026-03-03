import React from 'react';

const MapLinks = ({ latitude, longitude }) => {
    const googleMapsLink = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    const appleMapsLink = `https://maps.apple.com/?q=${latitude},${longitude}`;
    const openStreetMapLink = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
    const bingMapsLink = `https://www.bing.com/maps?cp=${latitude}~${longitude}&mlat=${latitude}&mlon=${longitude}`;

    return (
        <div>
            <a href={googleMapsLink} target="_blank" rel="noopener noreferrer">Google Maps</a>
            <a href={appleMapsLink} target="_blank" rel="noopener noreferrer">Apple Maps</a>
            <a href={openStreetMapLink} target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
            <a href={bingMapsLink} target="_blank" rel="noopener noreferrer">Bing Maps</a>
        </div>
    );
};

export default MapLinks;