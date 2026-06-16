import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import Home from '@/pages/Home';

const theme = createTheme({
  primaryColor: 'brass',
  colors: {
    brass: [
      '#FFF8E7', '#F5E6B8', '#E8CC7A', '#D4A83E', '#C8A951',
      '#B8943D', '#A07D2E', '#876820', '#6E5312', '#553F08',
    ],
    bronze: [
      '#F5EDE4', '#E8D5C0', '#D4B088', '#B88A50', '#9A6B30',
      '#7D5020', '#613A14', '#4A3728', '#3A2A1E', '#2A1E14',
    ],
  },
  fontFamily: 'Source Sans 3, sans-serif',
  headings: {
    fontFamily: 'Playfair Display, serif',
  },
  defaultRadius: 'md',
});

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </Router>
    </MantineProvider>
  );
}
