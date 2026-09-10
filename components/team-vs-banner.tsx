import { copy } from '../copy';

type BannerPlayer = { id: string; name: string };

function TeamSide({
  label,
  listLabel,
  players,
  placeholder,
  ballSrc,
}: {
  label: string;
  listLabel: string;
  players: BannerPlayer[] | null;
  placeholder: string;
  ballSrc: string;
}) {
  return (
    <div className="team-vs-banner__content">
      <span>{label}</span>
      {players ? (
        <ul className="team-vs-banner__players" aria-label={listLabel}>
          {players.map((player) => (
            <li className="team-vs-banner__player" key={player.id}>
              <img
                className="team-vs-banner__player-icon"
                src={ballSrc}
                alt=""
                width={14}
                height={14}
              />
              <span className="team-vs-banner__player-name">{player.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="team-vs-banner__placeholder">{placeholder}</p>
      )}
    </div>
  );
}

export function TeamVsTeamBanner({
  bluePlayers,
  redPlayers,
}: {
  bluePlayers: BannerPlayer[] | null;
  redPlayers: BannerPlayer[] | null;
}) {
  return (
    <section className="team-vs-banner" aria-label={copy.live.selectedTeamsAria}>
      <div className="team-vs-banner__side team-vs-banner__side--blue">
        <TeamSide
          label={copy.live.blueTeam}
          listLabel={copy.live.blueTeamPlayers}
          players={bluePlayers}
          placeholder={copy.live.chooseTwoPlayers}
          ballSrc="/team-player-ball-blue.webp"
        />
      </div>
      <div className="team-vs-banner__center" aria-hidden="true">
        <span>{copy.live.vs}</span>
      </div>
      <div className="team-vs-banner__side team-vs-banner__side--red">
        <TeamSide
          label={copy.live.redTeam}
          listLabel={copy.live.redTeamPlayers}
          players={redPlayers}
          placeholder={copy.live.waiting}
          ballSrc="/team-player-ball-red.webp"
        />
      </div>
    </section>
  );
}
