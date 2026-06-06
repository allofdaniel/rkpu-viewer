import React from 'react';

interface AircraftData {
  callsign?: string;
  registration?: string;
  type?: string;
  icao_type?: string;
}

interface AircraftPhoto {
  image?: string;
  photographer?: string;
  link?: string;
  source?: string;
}

interface AircraftImage {
  src?: string;
  link?: string;
  copyright?: string;
  source?: string;
}

type AircraftImageArray = (string | AircraftImage)[];

interface FlightSchedule {
  aircraft_images?: AircraftImageArray;
}

interface AircraftPhotoSectionProps {
  displayAircraft: AircraftData;
  aircraftPhoto: AircraftPhoto | null;
  aircraftPhotoLoading: boolean;
  flightSchedule: FlightSchedule | null;
  getAircraftImage: (type: string) => string;
}

const AircraftPhotoSection: React.FC<AircraftPhotoSectionProps> = ({
  displayAircraft,
  aircraftPhoto,
  aircraftPhotoLoading,
  flightSchedule,
  getAircraftImage,
}) => {
  const scheduleImages = (flightSchedule?.aircraft_images || [])
    .map((image) => (typeof image === 'string' ? { src: image, source: 'FlightRadar24' } : image))
    .filter((image): image is AircraftImage => !!image?.src);

  const photoCandidates: AircraftImage[] = [
    ...(aircraftPhoto?.image
      ? [{
          src: aircraftPhoto.image,
          link: aircraftPhoto.link,
          copyright: aircraftPhoto.photographer,
          source: aircraftPhoto.source || 'Aircraft photo',
        }]
      : []),
    ...scheduleImages,
  ];

  const fallbackImage = getAircraftImage(displayAircraft.icao_type || displayAircraft.type || '');

  const handlePhotoError = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    const target = event.currentTarget;
    const index = Number(target.dataset.photoIndex || '0');
    const next = photoCandidates[index + 1];

    if (next?.src) {
      target.dataset.photoIndex = String(index + 1);
      target.src = next.src;
      return;
    }

    target.src = fallbackImage;
    target.classList.add('aircraft-photo-default');
    target.onerror = null;
  };

  const primaryPhoto = photoCandidates[0];
  const credit = primaryPhoto?.copyright || aircraftPhoto?.photographer || primaryPhoto?.source;

  return (
    <div className="aircraft-photo-section">
      {!primaryPhoto && aircraftPhotoLoading && (
        <div className="aircraft-photo-loading">
          <div className="loading-spinner" />
        </div>
      )}

      {primaryPhoto && (
        <img
          src={primaryPhoto.src}
          data-photo-index="0"
          alt={displayAircraft.registration || displayAircraft.callsign || 'Aircraft'}
          className="aircraft-photo"
          referrerPolicy="no-referrer"
          onError={handlePhotoError}
        />
      )}

      {!primaryPhoto && !aircraftPhotoLoading && (
        <img
          src={fallbackImage}
          alt={displayAircraft.type || 'Aircraft'}
          className="aircraft-photo aircraft-photo-default"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}

      {credit && primaryPhoto && (
        <div className="aircraft-photo-credit">
          {primaryPhoto.link ? <a href={primaryPhoto.link} target="_blank" rel="noreferrer">{credit}</a> : credit}
        </div>
      )}

      {!primaryPhoto && !aircraftPhotoLoading && (displayAircraft.icao_type || displayAircraft.type) && (
        <div className="aircraft-photo-credit type-info">
          {displayAircraft.icao_type || displayAircraft.type}
        </div>
      )}
    </div>
  );
};

export default AircraftPhotoSection;