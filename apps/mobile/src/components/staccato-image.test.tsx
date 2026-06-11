import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { StaccatoImage } from "./staccato-image";

const mockUseSession = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => mockUseSession(),
}));

// Thin pass-through so the test asserts the source/handlers StaccatoImage
// supplies, not expo-image's internal source-array normalisation.
jest.mock("expo-image", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports
  const { View: MockView } = require("react-native");
  return {
    Image: (props: Record<string, unknown>) => {
      const { testID, source, onError } = props;
      return (
        <MockView testID={testID as string} source={source} onError={onError} />
      );
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({
    session: { serverUrl: "https://music.example.com", token: "tok" },
  });
});

const fallback = <Text>placeholder</Text>;

describe("StaccatoImage", () => {
  it("renders an image with the session-resolved source for a server-relative url", () => {
    render(
      <StaccatoImage
        testID="img"
        uri="/metadata/covers/abc.jpg"
        fallback={fallback}
      />,
    );

    const image = screen.getByTestId("img");
    expect(image.props.source).toEqual({
      uri: "https://music.example.com/metadata/covers/abc.jpg",
      headers: { Authorization: "Bearer tok" },
    });
    expect(screen.queryByText("placeholder")).toBeNull();
  });

  it("renders the fallback when the url cannot be resolved", () => {
    render(<StaccatoImage testID="img" uri={null} fallback={fallback} />);

    expect(screen.queryByTestId("img")).toBeNull();
    expect(screen.getByText("placeholder")).toBeOnTheScreen();
  });

  it("renders the fallback after the image fails to load", () => {
    render(
      <StaccatoImage
        testID="img"
        uri="/metadata/covers/abc.jpg"
        fallback={fallback}
      />,
    );

    fireEvent(screen.getByTestId("img"), "error");

    expect(screen.queryByTestId("img")).toBeNull();
    expect(screen.getByText("placeholder")).toBeOnTheScreen();
  });
});
