import { Text, Inline, Box, Lozenge, User, AtlassianTile, Link } from '@forge/react';
import { AtlassianTileType } from '..';
import { FullContext } from '@forge/bridge';
import { notificationCard } from './xcssStyles';
import { getGlyph } from '../utils/helpers';
import { getUpdateDescription } from '../utils/helpers';
import { ActivityEntry } from '../../types';

interface NotificationCardProps {
  index: number;
  val: ActivityEntry;
  context: FullContext | undefined;
}

export const NotificationCard = ({ index, val, context }: NotificationCardProps) => {
  let lozengeAppearance: any = 'moved';

  if (['progressFromDone', 'progressFromOther'].includes(val.transition)) {
    lozengeAppearance = 'inprogress';
  } else if (['doneFromProgress', 'doneFromOther'].includes(val.transition)) {
    lozengeAppearance = 'success';
  } else if (val.transition == 'otherFromDone') {
    lozengeAppearance = 'removed';
  }

  return (
    <Box key={index} xcss={notificationCard}>
      <Inline alignBlock="center" space="space.100">
        <Lozenge appearance={lozengeAppearance} isBold>
          Update
        </Lozenge>
        <User accountId={val.user} hideDisplayName />
        <Box>
          {context && (
            <Inline alignBlock="center" space="space.100">
              <AtlassianTile
                glyph={getGlyph(val.issueType) as AtlassianTileType}
                size="small"
                label="bug tile"
              />
              <Link href={`${context.siteUrl}/browse/${val.issueKey}`}>{val.issueKey}</Link>
              <Text>
                {' '}
                {getUpdateDescription(val.transition)} {val.points} points
              </Text>
            </Inline>
          )}
        </Box>
      </Inline>
    </Box>
  );
};
