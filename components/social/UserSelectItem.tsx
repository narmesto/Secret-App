import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { ThemeColors } from '../../context/theme';

interface UserSelectItemProps {
  user: any;
  isSelected: boolean;
  onPress: () => void;
  colors: ThemeColors;
}

const UserSelectItem: React.FC<UserSelectItemProps> = ({ user, isSelected, onPress, colors }) => {
  const styles = makeStyles(colors);
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Image
        source={{ uri: user.avatar_url || 'https://placekitten.com/g/200/200' }}
        style={styles.avatar}
      />
      <Text style={styles.name}>{user.display_name}</Text>
      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]} />
    </TouchableOpacity>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 10,
  },
  name: {
    flex: 1,
    fontWeight: 'bold',
    color: colors.text,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.muted,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});

export default UserSelectItem;
